const NODE_RADIUS = 20;

const nodes = [];
let edges = [];
const oneWayWalls = [];  // Represents cliffs or similar geometry
let goalNode = 0;

function completeDirectedGraph(nodes, edges) {
  nodes.forEach((_, i) => {
    nodes.forEach((_, j) => {
      if (i !== j) {
        edges.push([i, j]);
      }
    });
  });
}

function addNode(x, y) {
  nodes.push(createVector(x, y));
  edges = [];
  completeDirectedGraph(nodes, edges);
}

let lastWallPoint = null;
function addWallPoint(x, y) {
  if (lastWallPoint == null) {
    lastWallPoint = createVector(x, y);
  } else {
    const newWallPoint = createVector(x, y);
    oneWayWalls.push([lastWallPoint, newWallPoint]);
    lastWallPoint = newWallPoint;
  }
}

function setup() {
  const canvas = createCanvas(640, 480);
  const toolSelector = createRadio();
  toolSelector.option('nodes');
  toolSelector.option('walls');
  toolSelector.value('walls');
  createButton('new wall').mousePressed(() => {
    lastWallPoint = null;
  });
  canvas.mouseClicked(() => {
    if (toolSelector.value() == 'nodes') {
      addNode(mouseX, mouseY);
    } else if (toolSelector.value() == 'walls') {
      addWallPoint(mouseX, mouseY);
    }
    redraw();
  });
  createInput('').input(function changeGoalNode() {
    const value = +this.value();
    if (this.value() && 0 <= value && value < nodes.length) {
      goalNode = value;
    }
    redraw();
  });

  noLoop();
}

function drawArrow(x0, y0, x1, y1) {
  const direction = createVector(x0, y0).sub(createVector(x1, y1)).heading();
  line(x0, y0, x1, y1);
  push();
  translate(x1, y1);
  rotate(direction + PI);
  fill(0);
  // This points right because 0 radians lies along the x axis.
  triangle(0, 0, -10, 6, -10, -6);
  pop();
}

function drawEdge(edge) {
  const startNode = nodes[edge[0]];
  const endNode = nodes[edge[1]];
  const difference = p5.Vector.sub(endNode, startNode);
  const magnitude = difference.mag();
  const toEdge = difference.copy().setMag(magnitude - NODE_RADIUS / 2);
  drawArrow(startNode.x, startNode.y, startNode.x + toEdge.x, startNode.y + toEdge.y);
}

function lineSegmentsIntersect(p1, p2, p3, p4) {
  // Ported from https://www.openprocessing.org/sketch/135314
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;

  const x3 = p3.x;
  const y3 = p3.y;
  const x4 = p4.x;
  const y4 = p4.y;

  const bx = x2 - x1;
  const by = y2 - y1;
  const dx = x4 - x3;
  const dy = y4 - y3;
 
  const b_dot_d_perp = bx * dy - by * dx;
 
  if(b_dot_d_perp == 0) return false;
 
  const cx = x3 - x1;
  const cy = y3 - y1;
 
  const t = (cx * dy - cy * dx) / b_dot_d_perp;
  if(t < 0 || t > 1) return false;
 
  const u = (cx * by - cy * bx) / b_dot_d_perp;
  if(u < 0 || u > 1) return false;
 
  // return new PVector(x1+t*bx, y1+t*by);
  return true;
}

function edgeHitsAnyOneWayWalls([node1Index, node2Index]) {
  return oneWayWalls.filter(wall => {
    const start = nodes[node1Index];
    const end = nodes[node2Index];
    const wallNormal = p5.Vector.sub(wall[1], wall[0]).rotate(HALF_PI);
    const edgeAndWallFaceOppositeDirection = wallNormal.dot(p5.Vector.sub(end, start)) < 0;
    return lineSegmentsIntersect(start, end, wall[0], wall[1]) && edgeAndWallFaceOppositeDirection;
  }).reduce((prev, current) => { return prev || current; }, false);
}

function isTraversible(edge) {
  return !edgeHitsAnyOneWayWalls(edge);
}

function drawLineWithNormal(start, end) {
  const center = p5.Vector.add(start, end).div(2);
  const normal = p5.Vector.sub(end, start).div(8).rotate(HALF_PI);
  line(start.x, start.y, end.x, end.y);
  line(center.x, center.y, center.x + normal.x, center.y + normal.y);
}

function nodeIsIn(node, nodes) {
  return nodes.map(n => {
    return n == node;
  }).reduce((prev, cur) => {
    return prev || cur;
  }, false);
}

function edgeLeavesReachedSubgraph([start, end], reachedNodes) {
  return nodeIsIn(start, reachedNodes) && !nodeIsIn(end, reachedNodes);
}

function edgeEntersReachedSubgraph([start, end], reachedNodes) {
  return !nodeIsIn(start, reachedNodes) && nodeIsIn(end, reachedNodes);
}

function removeEdgesLeavingSubgraph(nodes, edges) {
  return edges.filter(e => { return !edgeLeavesReachedSubgraph(e, nodes); });
}

function pruneToTree(goalNodeIndex, edges) {
  let branches = [];
  let reachedNodes = [goalNodeIndex];
  let nodeDistancesToGoal = {};
  nodeDistancesToGoal[goalNodeIndex] = 0;

  let previousNodeReachCount = reachedNodes.length;
  while (reachedNodes.length < nodes.length) {
    // Get the edges from the rest of the graph that lead to nodes that have been reached.
    // These edges originate from the nodes we want to add to the reached nodes this iteration.
    const edgesEnteringSubgraph = edges.filter(e => {
      return edgeEntersReachedSubgraph(e, reachedNodes);
    });
    // Multiple edges may originate from any given node, so group them, sort the edges by
    // distance, and keep only the shortest one.
    const enteringEdgesByStartNode = edgesEnteringSubgraph.reduce((memo, [start, end]) => {
      memo[start] = memo[start] || [];
      memo[start].push([start, end]);
      return memo;
    }, {});
    Object.values(enteringEdgesByStartNode).forEach(edgeList => {
      edgeList.sort((e1, e2) => {
        return (nodes[e1[0]].dist(nodes[e1[1]]) + nodeDistancesToGoal[e1[1]]) -
          (nodes[e2[0]].dist(nodes[e2[1]]) + nodeDistancesToGoal[e2[1]]);
      });
    });
    const closestEdges = Object.values(enteringEdgesByStartNode).map(edgeList => {
      return edgeList[0];
    });
    // Then add the edges to our tree, and add the nodes they originate from to our subgraph.
    branches = branches.concat(closestEdges);
    closestEdges.forEach(([start,]) => {
      if (!nodeIsIn(start, reachedNodes)) {
        reachedNodes.push(start);
      }
    });
    if (previousNodeReachCount == reachedNodes.length) {
      break;
    }
    previousNodeReachCount = reachedNodes.length;
  }
  return branches;
}
var reachabilityEdges;
function draw() {
  background(240);
  // const reachabilityEdges = edges.filter(isTraversible);
  reachabilityEdges = edges.filter(isTraversible);
  // reachabilityEdges.forEach(drawEdge);
  pruneToTree(goalNode, reachabilityEdges).forEach(drawEdge);
  nodes.forEach((node, i) => {
    fill(goalNode == i ? 0 : 255);
    ellipse(node.x, node.y, NODE_RADIUS, NODE_RADIUS);
  });
  oneWayWalls.forEach(([start, end]) => {
    drawLineWithNormal(start, end);
  });
}