// import embeddings lib
import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.9.0/dist/transformers.min.js";
const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const DIMENSION = 384;
// import react
const e = React.createElement;

/// global graph properties

const GRAPH_WIDTH = 1000;
const INIT_X = 10;
const INIT_Y = 500;
const MOVE_LINK_BAR_HEIGHT = 40; // how tall the forelink/backlink bars over each move should be
const MIN_LINK_STRENGTH = 0.35;
const SEGMENT_THRESHOLD = 1000 * 60 * 30; // 30 mins -> milliseconds

/// math utils

function sum(xs) {
	return xs.reduce((a, b) => a + b, 0);
}

function dotProduct(vectorA, vectorB) {
	let dotProd = 0;
	for (let comp = 0; comp < DIMENSION; comp++) {
		dotProd += vectorA[comp] * vectorB[comp];
	}
	return dotProd;
}

function magnitude(vector) {
	return Math.sqrt(dotProduct(vector, vector));
}

function cosineSimilarity(vectorA, vectorB) {
	const dotProd = dotProduct(vectorA, vectorB);
	const magProd = magnitude(vectorA) * magnitude(vectorB);
	return dotProd / magProd;
}

// Translate `num` from the scale bounded by `oldMin` and `oldMax`
// to the scale bounded by `newMin` and `newMax`.
function scale(num, [oldMin, oldMax], [newMin, newMax]) {
	const oldRange = oldMax - oldMin;
	const newRange = newMax - newMin;
	return (((num - oldMin) / oldRange) * newRange) + newMin;
}

/// stats on a computed linkograph

function computeLinkIndexes(graph) {
	for (let i = 0; i < graph.moves.length; i++) {
		graph.moves[i].backlinkIndex = sum(
			Object.values(graph.links[i])
				.filter(n => n >= MIN_LINK_STRENGTH)
				.map(n => scale(n, [MIN_LINK_STRENGTH, 1], [0, 1]))
		);
		graph.moves[i].forelinkIndex = sum(
			Object.values(graph.links).map(linkSet => linkSet[i] || 0)
				.filter(n => n >= MIN_LINK_STRENGTH)
				.map(n => scale(n, [MIN_LINK_STRENGTH, 1], [0, 1]))
		); 
	}
	// naïvely mark critical moves: top 3 link indexes in each direction
	graph.moves.toSorted((a, b) => b.backlinkIndex - a.backlinkIndex).slice(0, 3)
		.forEach(move => { move.backlinkCriticalMove = true; });
	graph.moves.toSorted((a, b) => b.forelinkIndex - a.forelinkIndex).slice(0, 3)
		.forEach(move => { move.forelinkCriticalMove = true; });
	// calculate max forelink and backlink indexes seen, for visual scaling
	graph.maxForelinkIndex = Math.max(...graph.moves.map(move => move.forelinkIndex));
	graph.maxBacklinkIndex = Math.max(...graph.moves.map(move => move.backlinkIndex));
}

function entropy(pOn, pOff) {
	const pOnPart = pOn > 0 ? -(pOn * Math.log2(pOn)) : 0;
	const pOffPart = pOff > 0 ? -(pOff * Math.log2(pOff)) : 0;
	return pOnPart + pOffPart;
}

function computeEntropy(graph) {
	// backlinks and forelinks
	for (let i = 0; i < graph.moves.length; i++) {
		// backlinks
		const maxPossibleBacklinkStrength = i;
		const backlinkPOn = graph.moves[i].backlinkIndex / maxPossibleBacklinkStrength;
		const backlinkPOff = 1 - backlinkPOn;
		graph.moves[i].backlinkEntropy = entropy(backlinkPOn, backlinkPOff);
		// forelinks
		const maxPossibleForelinkStrength = graph.moves.length - (i + 1);
		const forelinkPOn = graph.moves[i].forelinkIndex / maxPossibleForelinkStrength;
		const forelinkPOff = 1 - forelinkPOn;
		graph.moves[i].forelinkEntropy = entropy(forelinkPOn, forelinkPOff);
	}
	graph.backlinkEntropy = sum(graph.moves.map(move => move.backlinkEntropy));
	graph.forelinkEntropy = sum(graph.moves.map(move => move.forelinkEntropy));
	// horizonlinks
	// each "horizon state" is the set of possible links between pairs of moves
	// that are N apart from each other
	graph.horizonlinkEntropy = 0;
	for (let horizon = 1; horizon < (graph.moves.length - 1); horizon++) {
		let maxPossibleHorizonlinkStrength = -1; // off by one otherwise
		let actualHorizonlinkStrength = 0;
		// get all pairs of move indexes (i,j) that are N apart
		for (let i = 0; i <= graph.moves.length - horizon; i++) {
			const j = i + horizon;
			maxPossibleHorizonlinkStrength += 1; // a link is possible
			const linkStrength = graph.links[j]?.[i] || 0;
			if (linkStrength < MIN_LINK_STRENGTH) continue;
			actualHorizonlinkStrength += scale(linkStrength, [MIN_LINK_STRENGTH, 1], [0, 1]);
		}
		const horizonlinkPOn = actualHorizonlinkStrength / maxPossibleHorizonlinkStrength;
		const horizonlinkPOff = 1 - horizonlinkPOn;
		graph.horizonlinkEntropy += entropy(horizonlinkPOn, horizonlinkPOff);
	}
	// sum them all up
	graph.entropy = graph.backlinkEntropy + graph.forelinkEntropy + graph.horizonlinkEntropy;
}

/// data processing

async function embed(str) {
	return (await extractor(str, {convert_to_tensor: "True", pooling: "mean", normalize: true}))[0];
}

async function deriveLinks(moves) {
	// calculate embeddings for each move
	for (const move of moves) {
		move.embedding = (await embed(move.text)).tolist();
	}
	// build links table
	const links = {};
	for (let i = 0; i < moves.length; i++) {
		const currMove = moves[i];
		links[i] = {};
		for (let j = 0; j < i; j++) {
			const prevMove = moves[j];
			links[i][j] = cosineSimilarity(currMove.embedding, prevMove.embedding);
		}
	}
	return links;
}

/// react rendering

// Given the rendered locations of two design moves, return the location of the
// right-angle "elbow" between them.
function elbow(pt1, pt2) {
	const x = (pt1.x + pt2.x) / 2;
	const y = pt1.y - ((pt2.x - pt1.x) / 2);
	return {x, y};
}

// Given `props` augmented with the `idx` of a design move, return the location
// at which this move should be rendered.
function moveLoc(props) {
	return {x: (props.idx * props.moveSpacing) + INIT_X, y: INIT_Y};
}

function shouldSegmentTimeline(currMove, prevMove) {
	if (!(currMove?.timestamp && prevMove?.timestamp)) return false;
	const deltaTime = Date.parse(currMove.timestamp) - Date.parse(prevMove.timestamp);
	return deltaTime >= SEGMENT_THRESHOLD;
}

function DesignMove(props) {
	const move = props.moves[props.idx];
	const currLoc = moveLoc(props);
	const scaledForelinkIndex = scale(
		move.forelinkIndex, [0, props.maxForelinkIndex], [0, MOVE_LINK_BAR_HEIGHT]
	);
	const scaledBacklinkIndex = scale(
		move.backlinkIndex, [0, props.maxBacklinkIndex], [0, MOVE_LINK_BAR_HEIGHT]
	);
	const moveLinkBarSize = 10 + MOVE_LINK_BAR_HEIGHT + 10;
	// create correct move marker based on actor
	let moveMarker = null;
	if (move.actor === 1) {
		moveMarker = e("rect", {
			x: currLoc.x - 5, y: currLoc.y - 5, height: 10, width: 10, fill: "blue"
		});
	}
	else {
		moveMarker = e("circle", {cx: currLoc.x, cy: currLoc.y, r: 5, fill: "red"});
	}
	return e("g", {},
		e("text", {
			x: currLoc.x + 5, y: currLoc.y - moveLinkBarSize,
			transform: `rotate(270, ${currLoc.x + 5}, ${currLoc.y - moveLinkBarSize})`,
			fontWeight: (move.backlinkCriticalMove || move.forelinkCriticalMove) ? "bold" : "normal",
		}, move.text),
		e("rect", {
			x: currLoc.x - 5, y: (currLoc.y - 10) - scaledBacklinkIndex,
			width: 5, height: scaledBacklinkIndex, fill: "#998ec3",
		}),
		e("rect", {
			x: currLoc.x, y: (currLoc.y - 10) - scaledForelinkIndex,
			width: 5, height: scaledForelinkIndex, fill: "#f1a340",
		}),
		moveMarker
	);
}

function makeTimelineDividers(props) {
	const dividers = [];
	for (let idx = 0; idx < props.moves.length; idx++) {
		const currLoc = moveLoc({...props, idx});
		const splitAfter = shouldSegmentTimeline(props.moves[idx + 1], props.moves[idx]);
		if (!splitAfter) continue;
		dividers.push(e("line", {
			stroke: "#999", strokeDasharray: "2", strokeWidth: 1,
			x1: currLoc.x + (props.moveSpacing / 2), y1: currLoc.y - INIT_Y,
			x2: currLoc.x + (props.moveSpacing / 2), y2: currLoc.y + INIT_Y,
		}));
	}
	return dividers;
}

function makeLinkObjects(props) {
	const linkLines = [];
	const linkJoints = [];
	for (const [currIdx, linkSet] of Object.entries(props.links)) {
		const currLoc = moveLoc({...props, idx: currIdx});
		for (const [prevIdx, strength] of Object.entries(linkSet)) {
			if (strength < MIN_LINK_STRENGTH) continue; // skip weak connections (arbitrary threshold)
			const prevLoc = moveLoc({...props, idx: prevIdx});
			const jointLoc = elbow(currLoc, prevLoc);
			const lineStrength = scale(strength, [MIN_LINK_STRENGTH, 1], [255, 0]);
			const color = `rgb(${lineStrength},${lineStrength},${lineStrength})`;
			linkLines.push({
				x1: currLoc.x, y1: currLoc.y, x2: jointLoc.x, y2: jointLoc.y, color, strength,
			});
			linkLines.push({
				x1: prevLoc.x, y1: prevLoc.y, x2: jointLoc.x, y2: jointLoc.y, color, strength,
			});
			linkJoints.push({x: jointLoc.x, y: jointLoc.y, color, strength});
		}
	}
	return {linkLines, linkJoints};
}

function FuzzyLinkograph(props) {
	const dividers = makeTimelineDividers(props);
	const {linkLines, linkJoints} = makeLinkObjects(props);
	return e("div", {className: "fuzzy-linkograph"},
		e("h2", {}, props.title),
		e("svg", {viewBox: `0 0 ${GRAPH_WIDTH} ${(GRAPH_WIDTH / 2) + INIT_Y}`},
			...dividers,
			...linkLines.sort((a, b) => a.strength - b.strength).map(line => {
				return e("line", {
					x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2,
					stroke: line.color, strokeWidth: 2
				});
			}),
			...linkJoints.sort((a, b) => a.strength - b.strength).map(joint => {
				return e("circle", {cx: joint.x, cy: joint.y, r: 3, fill: joint.color});
			}),
			...props.moves.map((_, idx) => e(DesignMove, {...props, idx}))
		)
	);
}

/// top-level app init

const appState = {
	episodes: []
};

let root = null;
function renderUI() {
	if (!root) {
		root = ReactDOM.createRoot(document.getElementById('app'));
	}
	root.render(e("div", {},
		...appState.episodes.map(episode => e(FuzzyLinkograph, episode))
	));
}

async function loadDataset(datasetPath) {
	try {
		const json = await (await fetch(datasetPath)).json();
		for (const episodeID of Object.keys(json)) {
			const moves = json[episodeID].moves || json[episodeID]; // if no .moves, assume whole thing is moves list
			const sampleRate = 1; // 30 / moves.length; // downsample to 30ish moves at most
			appState.episodes.push({
				title: json[episodeID].title || episodeID,
				moves: moves.filter(x => Math.random() < sampleRate),
				links: json[episodeID].links,
			});
		}
	}
	catch (err) {
		console.log("Couldn't fetch dataset", datasetPath, err);
	}
}

async function main() {
	// load json-formatted data
	const datasetPaths = [
		"./data/test.json",
		"./data/papers.json",
		"./data/imggen_50.json",
	];
	for (const datasetPath of datasetPaths) {
		await loadDataset(datasetPath);
	}
	// generate linkographs for all episodes
	for (const episode of appState.episodes) {
		if (!episode.links) {
			episode.links = await deriveLinks(episode.moves);
		}
		computeLinkIndexes(episode);
		computeEntropy(episode);
		episode.moveSpacing = (GRAPH_WIDTH - (INIT_X * 4)) / (episode.moves.length - 1);
		console.log(episode);
	}
	renderUI();
}

main();
