import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import createAsciiMaterial from "../materials/AsciiMaterial";

import diamondSvg from "../assets/svg/diamond.svg?raw";

export default class FloatingObjects extends THREE.Group {
	constructor({
		size = 1.2,
		color = new THREE.Color(0xbfe3ff),

		spinSpeed = 0.75,

		floatSpeed = 1.5,
		floatAmplitude = 0.2,

		glowIntensity = 0.6,
		glowDistance = 4,

		/*
			true = glow is brighter and dimmer
			false = glow is completely constant
		*/
		glowPulseEnabled = true,

		glowPulseSpeed = 0.07,

		glowPulseAmount = 0.03,

		cellSize = 5,
	} = {}) {
		super();

		this.cellSize = cellSize;

		this.spinSpeed = spinSpeed;

		this.floatSpeed = floatSpeed;
		this.floatAmplitude = floatAmplitude;
		this.baseY = 0;

		this.glowIntensity = glowIntensity;
		this.glowPulseEnabled = glowPulseEnabled;
		this.glowPulseSpeed = glowPulseSpeed;
		this.glowPulseAmount = glowPulseAmount;

		const sourceGeometry =
			this.#createSvgGeometry(
				diamondSvg,
				size,
			);

		const geometry = sourceGeometry.index
			? sourceGeometry.toNonIndexed()
			: sourceGeometry;

		if (geometry !== sourceGeometry) {
			sourceGeometry.dispose();
		}

		/*
			The ASCII shader expects target-position and
			target-normal attributes for its morph system.

			We give it copies of the diamond's own vertices.
			This keeps it as one unchanged shape.
		*/
		const positions =
			geometry.getAttribute("position").array;

		const normals =
			geometry.getAttribute("normal").array;

		geometry.setAttribute(
			"aTargetPosition",
			new THREE.BufferAttribute(
				positions.slice(),
				3,
			),
		);

		geometry.setAttribute(
			"aTargetNormal",
			new THREE.BufferAttribute(
				normals.slice(),
				3,
			),
		);

		this.mesh = new THREE.Mesh(
			geometry,
			createAsciiMaterial({
				color: new THREE.Color(color),
				cellSize,
			}),
		);

		this.mesh.castShadow = false;

		this.add(this.mesh);

		this.glow = new THREE.PointLight(
			color,
			glowIntensity,
			glowDistance,
			2,
		);

		this.add(this.glow);
	}

	#createSvgGeometry(svgText, size) {
		const loader = new SVGLoader();
		const data = loader.parse(svgText);

		const geometries = [];

		for (const path of data.paths) {
			const shapes =
				SVGLoader.createShapes(path);

			for (const shape of shapes) {
				const geometry =
					new THREE.ExtrudeGeometry(
						shape,
						{
							depth: 10,
							curveSegments: 5,
							steps: 1,

							bevelEnabled: true,
							bevelThickness: 1,
							bevelSize: 1,
							bevelSegments: 2,
						},
					);

				geometries.push(geometry);
			}
		}

		if (!geometries.length) {
			throw new Error(
				"Could not create geometry from diamond.svg. The SVG needs closed, filled paths.",
			);
		}

		const merged =
			BufferGeometryUtils.mergeGeometries(
				geometries,
				false,
			);

		geometries.forEach((geometry) => {
			geometry.dispose();
		});

		if (!merged) {
			throw new Error(
				"Could not merge the diamond SVG paths.",
			);
		}

		merged.computeBoundingBox();

		const dimensions =
			merged.boundingBox.getSize(
				new THREE.Vector3(),
			);

		const largestSide = Math.max(
			dimensions.x,
			dimensions.y,
		);

		if (
			largestSide === 0 ||
			dimensions.z === 0
		) {
			merged.dispose();

			throw new Error(
				"The diamond SVG has no usable dimensions.",
			);
		}

		/*
			Overall width and height of the diamond.
		*/
		const targetWidthOrHeight =
			size * 1.6;

		/*
			Final thickness of the diamond.
		Lower number = thinner.
		*/
		const targetDepth =
			size * 0.1;

		const xyScale =
			targetWidthOrHeight /
			largestSide;

		const zScale =
			targetDepth /
			dimensions.z;

		/*
			SVG coordinates point downward on the Y axis.
			Three.js coordinates point upward, so Y is flipped.
		*/
		merged.scale(
			xyScale,
			-xyScale,
			zScale,
		);

		merged.center();
		merged.computeVertexNormals();
		merged.computeBoundingSphere();

		return merged;
	}

	setBasePosition(x, y, z) {
		this.position.set(x, y, z);
		this.baseY = y;
	}

	setCellScale(scale) {
		this.mesh.material.uniforms.uCellSize.value =
			(
				this.cellSize *
				Math.min(
					window.devicePixelRatio,
					2,
				)
			) / scale;
	}

	update(elapsed) {
		const uniforms =
			this.mesh.material.uniforms;

		uniforms.uTime.value = elapsed;
		uniforms.uMorph.value = 0;

		if (this.glowPulseEnabled) {
			/*
				Math.sin moves smoothly between -1 and 1.

				Multiplying by glowPulseAmount controls
				how far the brightness moves away from its
				normal intensity.
			*/
			const glowPulse =
				1 +
				Math.sin(
					elapsed *
						this.glowPulseSpeed,
				) *
					this.glowPulseAmount;

			this.glow.intensity =
				this.glowIntensity *
				glowPulse;
		} else {
			/*
				No brightness shifting.
			*/
			this.glow.intensity =
				this.glowIntensity;
		}

		this.rotation.y =
			elapsed *
			this.spinSpeed;

		this.position.y =
			this.baseY +
			Math.sin(
				elapsed *
					this.floatSpeed,
			) *
				this.floatAmplitude;
	}
}