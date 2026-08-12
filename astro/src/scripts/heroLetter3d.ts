import * as THREE from 'three';

const buildLetterShape = () => {
	const shape = new THREE.Shape();

	shape.moveTo(-2.65, -4.15);
	shape.lineTo(-2.65, 4.15);
	shape.lineTo(0.05, 4.15);
	shape.bezierCurveTo(2.55, 4.15, 3.25, 2.95, 3.25, 2.03);
	shape.bezierCurveTo(3.25, 0.92, 2.62, 0.25, 1.38, 0.02);
	shape.bezierCurveTo(2.86, -0.2, 3.55, -1.05, 3.55, -2.15);
	shape.bezierCurveTo(3.55, -3.48, 2.48, -4.15, 0.18, -4.15);
	shape.closePath();

	const upperCounter = new THREE.Path();
	upperCounter.moveTo(-1.05, 2.85);
	upperCounter.lineTo(0.08, 2.85);
	upperCounter.bezierCurveTo(1.22, 2.85, 1.68, 2.38, 1.68, 1.77);
	upperCounter.bezierCurveTo(1.68, 1.1, 1.2, 0.74, 0.02, 0.74);
	upperCounter.lineTo(-1.05, 0.74);
	upperCounter.closePath();

	const lowerCounter = new THREE.Path();
	lowerCounter.moveTo(-1.05, -0.78);
	lowerCounter.lineTo(0.15, -0.78);
	lowerCounter.bezierCurveTo(1.42, -0.78, 1.92, -1.2, 1.92, -1.93);
	lowerCounter.bezierCurveTo(1.92, -2.7, 1.38, -3.08, 0.06, -3.08);
	lowerCounter.lineTo(-1.05, -3.08);
	lowerCounter.closePath();

	shape.holes.push(upperCounter, lowerCounter);
	return shape;
};

export const mountHeroLetter3d = (host: HTMLElement) => {
	if (host.dataset.mounted === 'true') return;
	host.dataset.mounted = 'true';

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
	camera.position.set(0.6, 0.05, 18.5);

	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
	renderer.setClearColor(0xffffff, 0);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.08;
	renderer.domElement.setAttribute('aria-hidden', 'true');
	host.prepend(renderer.domElement);

	const geometry = new THREE.ExtrudeGeometry(buildLetterShape(), {
		depth: 1.35,
		steps: 1,
		curveSegments: 32,
		bevelEnabled: true,
		bevelSegments: 8,
		bevelSize: 0.19,
		bevelThickness: 0.2,
	});
	geometry.center();

	const faceMaterial = new THREE.MeshPhysicalMaterial({
		color: 0xe4e0da,
		metalness: 0.12,
		roughness: 0.28,
		clearcoat: 0.72,
		clearcoatRoughness: 0.2,
		sheen: 0.28,
		sheenColor: new THREE.Color(0xffffff),
	});
	const sideMaterial = new THREE.MeshPhysicalMaterial({
		color: 0xaaa39a,
		metalness: 0.18,
		roughness: 0.34,
		clearcoat: 0.55,
		clearcoatRoughness: 0.26,
	});
	const letter = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
	letter.rotation.x = -0.06;
	scene.add(letter);
	geometry.computeBoundingBox();
	const bounds = geometry.boundingBox;
	const letterWidth = bounds ? bounds.max.x - bounds.min.x : 6.6;
	const letterHeight = bounds ? bounds.max.y - bounds.min.y : 8.7;

	scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8177, 2.1));
	const keyLight = new THREE.DirectionalLight(0xffffff, 4.4);
	keyLight.position.set(-4.5, 6, 8);
	scene.add(keyLight);
	const rimLight = new THREE.DirectionalLight(0xffd5c4, 3.2);
	rimLight.position.set(7, 1, -5);
	scene.add(rimLight);
	const coolLight = new THREE.PointLight(0xd8e9ff, 18, 30);
	coolLight.position.set(-6, -4, 7);
	scene.add(coolLight);

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	let pointerX = 0;
	let pointerY = 0;
	let animationFrame = 0;
	const clock = new THREE.Clock();

	const onPointerMove = (event: PointerEvent) => {
		pointerX = (event.clientX / window.innerWidth - 0.5) * 0.12;
		pointerY = (event.clientY / window.innerHeight - 0.5) * 0.08;
	};

	const resize = () => {
		const { clientWidth, clientHeight } = host;
		if (!clientWidth || !clientHeight) return;
		renderer.setSize(clientWidth, clientHeight, false);
		camera.aspect = clientWidth / clientHeight;
		const verticalFov = THREE.MathUtils.degToRad(camera.fov);
		const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
		const fitHeightDistance = letterHeight / (2 * Math.tan(verticalFov / 2));
		const fitWidthDistance = letterWidth / (2 * Math.tan(horizontalFov / 2));
		camera.position.z = Math.max(fitHeightDistance, fitWidthDistance) * 1.2;
		camera.updateProjectionMatrix();
	};

	const render = () => {
		const elapsed = clock.getElapsedTime();
		if (!reducedMotion) {
			letter.rotation.y = elapsed * 0.34 + pointerX;
			letter.rotation.x += (-0.07 + pointerY - letter.rotation.x) * 0.035;
			letter.position.y = Math.sin(elapsed * 0.72) * 0.11;
		} else {
			letter.rotation.y = -0.34;
		}
		renderer.render(scene, camera);
		animationFrame = window.requestAnimationFrame(render);
	};

	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);
	window.addEventListener('pointermove', onPointerMove, { passive: true });
	resize();
	render();
	host.classList.add('is-ready');

	return () => {
		window.cancelAnimationFrame(animationFrame);
		window.removeEventListener('pointermove', onPointerMove);
		resizeObserver.disconnect();
		geometry.dispose();
		faceMaterial.dispose();
		sideMaterial.dispose();
		renderer.dispose();
		renderer.domElement.remove();
		host.dataset.mounted = 'false';
	};
};
