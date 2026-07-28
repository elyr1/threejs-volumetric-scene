import * as THREE from "three";
import ImportGltf from "../utils/ImportGltf";
import BentNormalShading from "../materials/BentNormalShading";

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];

const FINGER_BONE_RE =
	/^(thumb|index|middle|ring|pinky)\.?(\d+)?$/;

/*
	1.0 = original length
	0.82 = 18% shorter
	1.1 = 10% longer
*/
const FINGER_LENGTHS = {
	thumb: 1,
	index: 1,
	middle: 1,
	ring: 0.90,
	pinky: 0.86,
};

export default class Arm extends THREE.Group {
	static async load(url) {
		const root = await new Promise((resolve, reject) => {
			new ImportGltf(url, {
				onLoad: resolve,
				onError: reject,
			});
		});

		return new Arm(root);
	}

	constructor(root) {
		super();

		/*
			Measure the imported model, resize it consistently,
			and center it around the origin.
		*/
		const box = new THREE.Box3().setFromObject(root);
		const size = box.getSize(new THREE.Vector3());

		root.scale.setScalar(3.2 / size.y);

		box.setFromObject(root);
		root.position.sub(
			box.getCenter(new THREE.Vector3()),
		);

		this.mesh = null;
		this.handBone = null;
		this.handBaseY = 0;
		this.fingerBones = [];

		/*
			Search through the imported model for:
			- the visible mesh
			- the hand/wrist bone
			- every finger bone
		*/
		root.traverse((child) => {
			if (child.isMesh && !this.mesh) {
				this.mesh = child;
			}

			if (!child.isBone) {
				return;
			}

			if (child.name === "hand") {
				this.handBone = child;
				this.handBaseY = child.rotation.y;
				return;
			}

			const match = child.name.match(FINGER_BONE_RE);

			if (!match) {
				return;
			}

			const fingerName = match[1];

			this.fingerBones.push({
				bone: child,

				// Save the model's original values.
				baseX: child.rotation.x,
				baseScale: child.scale.clone(),

				fingerName,
				finger: FINGERS.indexOf(fingerName),

				/*
					An unsuffixed bone such as "ring"
					is treated as segment zero.
				*/
				segment: match[2]
					? parseInt(match[2], 10)
					: 0,
			});
		});

		this.#applyFingerLengths();

		this.add(root);
	}

	#applyFingerLengths() {
		for (const {
			bone,
			baseScale,
			fingerName,
			segment,
		} of this.fingerBones) {
			/*
				Only scale the first bone in each finger.

				Its child bones inherit that scale, so the
				whole finger becomes shorter without applying
				the scale repeatedly to every segment.
			*/
			if (segment !== 0) {
				continue;
			}

			const length =
				FINGER_LENGTHS[fingerName] ?? 1;

			bone.scale.set(
				baseScale.x,
				baseScale.y * length,
				baseScale.z,
			);
		}
	}

	setupShading() {
		this.shading =
			BentNormalShading.bakeAndApply(this.mesh);

		return this.shading;
	}

	update(elapsed) {
		if (this.fingerBones.length) {
			const segmentRange = [
				[-0.05, 0.06],
				[-0.1, 0.05],
				[-0.2, 0.075],
				[-0.0, 0.5],
			];

			// Lower speed means slower movement.
			const fingerSpeed = 0.65;

			// Lower amount means less bending.
			const fingerAmount = 0.18;

			for (const {
				bone,
				baseX,
				finger,
				segment,
			} of this.fingerBones) {
				const wave = Math.sin(
					elapsed * fingerSpeed +
						finger * 1.25 +
						segment * 0.15,
				);

				const [min, max] =
					segmentRange[
						Math.min(segment, 3)
					];

				bone.rotation.x =
					baseX +
					THREE.MathUtils.lerp(
						min,
						max,
						wave * 0.5 + 0.5,
					) *
						fingerAmount;
			}
		}

		/*
			Subtle wrist movement.
		*/
		if (this.handBone) {
			this.handBone.rotation.y =
				this.handBaseY +
				Math.sin(
					elapsed * 0.6 - 1.2,
				) *
					0.015 +
				Math.sin(elapsed * 0.25) *
					0.015;
		}
	}
}