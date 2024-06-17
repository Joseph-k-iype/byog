import './assets/icons/icons.css'
import './style.css'
import './dialog.css'
import {
  GraphComponent,
  GraphViewerInputMode,
  ICommand,
  ShapeNodeStyle,
  Point,
  Size,
  INode,
  PolylineEdgeStyle,
  Arrow,
  Rect,
  HierarchicLayout,
  LayoutExecutor,
  GroupNodeStyle,
  InteriorLabelModel,
  SolidColorFill,
  Stroke,
  CircularLayout,
  OrganicLayout,
  OrthogonalLayout,
  GraphItemTypes,
  DefaultLabelStyle,
  BetweennessCentrality,
  IGraph,
  LouvainModularityClustering,
  ShortestPath,
  IEdge,
  GraphBuilder,
  ExteriorLabelModel,
  ExteriorLabelModelPosition,
  Matrix
} from 'yfiles'
import { enableFolding } from './lib/FoldingSupport'
import './lib/yFilesLicense'
import { initializeGraphOverview } from './graph-overview'
import { exportDiagram } from './diagram-export'
import { initializeContextMenu } from './context-menu'
import { initializeGraphSearch } from './graph-search'
import Papa from 'papaparse'
import loadGraph from './lib/loadGraph'

const FIXED_NODE_SIZE = new Size(60, 40) // Adjust these values as needed

// Define a palette of colors
const colorPalette = [
  '#FFD700', // Gold
  '#00BFFF', // Deep Sky Blue
  '#DC143C', // Crimson
  '#32CD32', // Lime Green
  '#FF69B4', // Hot Pink
  '#8A2BE2', // Blue Violet
  '#FF8C00', // Dark Orange
  '#7FFF00', // Chartreuse
  '#D2691E', // Chocolate
  '#6495ED', // Cornflower Blue
  '#808080'  // Grey for unspecified types
]

const nodeTypeColors = new Map<string, string>()
let isIsometricView = false
let nodeLabelsVisible = true

// Function to assign colors dynamically to node types
function getNodeColor(nodeType: string): string {
  if (!nodeTypeColors.has(nodeType)) {
    const color = colorPalette[nodeTypeColors.size % colorPalette.length]
    nodeTypeColors.set(nodeType, color)
  }
  return nodeTypeColors.get(nodeType) || '#808080' // Default to grey if not found
}

document.addEventListener('DOMContentLoaded', async () => {
  const graphComponent = await initializeGraphComponent()
  initializeToolbar(graphComponent)
  addQuerySubmissionListener(graphComponent)
  initializeGraphOverview(graphComponent)
  initializeContextMenu(graphComponent)
  initializeGraphSearch(graphComponent)
  initializeSidebar(graphComponent) // Initialize the sidebar for subgraph feature
  exportDiagram(graphComponent, 'svg')
  exportDiagram(graphComponent, 'png')
  exportDiagram(graphComponent, 'pdf')
})

async function initializeGraphComponent(): Promise<GraphComponent> {
  const graphComponent = new GraphComponent('.graph-component-container')
  const inputMode = new GraphViewerInputMode()
  inputMode.addCanvasClickedListener((sender, args) => console.log('Canvas clicked')) // Debugging
  inputMode.addItemDoubleClickedListener((sender, args) => {
    if (INode.isInstance(args.item)) {
      handleNodeClick(args.item as INode, graphComponent)
      console.log('Node double-clicked') // Debugging
    }
  })
  graphComponent.inputMode = inputMode
  initializeTooltips(graphComponent)
  await loadGraph() // Remove the argument from the function call
  graphComponent.fitGraphBounds()
  return graphComponent
}

function initializeTooltips(graphComponent: GraphComponent) {
  const inputMode = graphComponent.inputMode as GraphViewerInputMode
  inputMode.toolTipItems = GraphItemTypes.NODE // Enable tooltips for nodes
  inputMode.addQueryItemToolTipListener((sender, args) => {
    if (INode.isInstance(args.item)) {
      const node = args.item as INode
      if (node.labels.size > 0) {
        args.toolTip = node.labels.first().text
        args.handled = true
      }
    }
  })
  inputMode.mouseHoverInputMode.enabled = true
}

function initializeToolbar(graphComponent: GraphComponent) {
  const toolbar = document.querySelector('.toolbar');
  console.log('Toolbar HTML structure:', toolbar?.innerHTML); // Debugging

  const layoutDropdown = document.querySelector('#layoutDropdown + .dropdown-menu');
  const analysisDropdown = document.querySelector('#analysisDropdown + .dropdown-menu');

  if (layoutDropdown) {
    console.log('Layout dropdown found'); // Debugging
    layoutDropdown.addEventListener('click', function (event) {
      const target = event.target as HTMLElement;
      console.log('Layout dropdown item clicked', target); // Debugging
      if (target && target.tagName === 'A') {
        const layoutType = target.getAttribute('data-layout');
        if (layoutType) {
          console.log(`Applying layout: ${layoutType}`); // Debugging
          applyLayout(graphComponent, layoutType);
        }
      }
    });
  } else {
    console.error('Layout dropdown not found!');
  }

  if (analysisDropdown) {
    console.log('Analysis dropdown found'); // Debugging
    analysisDropdown.addEventListener('click', function (event) {
      const target = event.target as HTMLElement;
      console.log('Analysis dropdown item clicked', target); // Debugging
      if (target && target.tagName === 'A') {
        const analysisType = target.getAttribute('data-analysis');
        if (analysisType) {
          console.log(`Performing analysis: ${analysisType}`); // Debugging
          performGraphAnalysis(graphComponent, analysisType);
        }
      }
    });
  } else {
    console.error('Analysis dropdown not found!');
  }

  // Initialize zoom and fit graph buttons
  document.getElementById('btn-increase-zoom')!.addEventListener('click', () => {
    ICommand.INCREASE_ZOOM.execute(null, graphComponent);
  });
  document.getElementById('btn-decrease-zoom')!.addEventListener('click', () => {
    ICommand.DECREASE_ZOOM.execute(null, graphComponent);
  });
  document.getElementById('btn-fit-graph')!.addEventListener('click', () => {
    ICommand.FIT_GRAPH_BOUNDS.execute(null, graphComponent);
  });

  document.getElementById('nodes-file-input')!.addEventListener('change', (event) => handleFileUpload(event, graphComponent));
  document.getElementById('edges-file-input')!.addEventListener('change', (event) => handleFileUpload(event, graphComponent));
  document.getElementById('groups-file-input')!.addEventListener('change', (event) => handleFileUpload(event, graphComponent));

  // Add event listeners for the new buttons
  document.getElementById('btn-toggle-labels')!.addEventListener('click', () => {
    toggleNodeLabels(graphComponent)
  })
  document.getElementById('btn-toggle-isometric')!.addEventListener('click', () => {
    toggleIsometricView(graphComponent)
  })
}

async function handleFileUpload(event: Event, graphComponent: GraphComponent) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  const fileType = input.id === 'nodes-file-input' ? 'nodes' : input.id === 'edges-file-input' ? 'edges' : 'groups';

  const fileData = await file.text();
  const parsedData = Papa.parse(fileData, { header: true }).data;

  if (fileType === 'nodes') {
    (window as any).uploadedNodes = parsedData;
  } else if (fileType === 'edges') {
    (window as any).uploadedEdges = parsedData;
  } else {
    (window as any).uploadedGroups = parsedData;
  }

  if ((window as any).uploadedNodes && (window as any).uploadedEdges) {
    loadAndProcessCSVFiles(graphComponent, (window as any).uploadedNodes, (window as any).uploadedEdges, (window as any).uploadedGroups);
  }
}

async function loadAndProcessCSVFiles(graphComponent: GraphComponent, nodes: any[], edges: any[], groups?: any[]) {
  const uniqueNodes = Array.from(new Map(nodes.map(node => [node.id, node])).values());

  const graphBuilder = new GraphBuilder(graphComponent.graph);

  const nodeSource = graphBuilder.createNodesSource({
    data: uniqueNodes,
    id: 'id',
    tag: (data: any) => data.type,
    layout: () => new Rect(Math.random() * 800, Math.random() * 600, 30, 30),
  });

  const edgeSource = graphBuilder.createEdgesSource({
    data: edges,
    sourceId: 'source',
    targetId: 'target'
  });

  const edgeStyle = new PolylineEdgeStyle({
    stroke: '2px solid black',
    targetArrow: 'default'
  });
  graphComponent.graph.edgeDefaults.style = edgeStyle;

  nodeSource.nodeCreator.createLabelBinding((data: any) => data.label || '');
  nodeSource.nodeCreator.addNodeCreatedListener((sender: any, event: { item: INode; dataItem: { type: any } }) => {
    const node = event.item as INode;
    const type = event.dataItem.type;
    if (!nodeTypeColors.has(type)) {
      const color = colorPalette[nodeTypeColors.size % colorPalette.length];
      nodeTypeColors.set(type, color);
    }
    const color = nodeTypeColors.get(type) || '#808080';
    const nodeStyle = new ShapeNodeStyle({
      shape: 'ellipse', // Use ellipse shape for circular nodes
      fill: new SolidColorFill(color),
      stroke: new Stroke('black', 1.5)
    });
    graphComponent.graph.setStyle(node, nodeStyle);
  });

  const labelModel = new ExteriorLabelModel();
  nodeSource.nodeCreator.addNodeCreatedListener((sender: any, args: { item: { labels: { first: () => any } } }) => {
    const label = args.item.labels.first();
    if (label) {
      const parameter = labelModel.createParameter(ExteriorLabelModelPosition.SOUTH);
      graphComponent.graph.setLabelLayoutParameter(label, parameter);
    }
  });

  graphBuilder.buildGraph();

  const layout = new OrganicLayout();
  layout.minimumNodeDistance = 40;
  layout.nodeOverlapsAllowed = false;
  await graphComponent.morphLayout(layout, '1s');

  graphComponent.fitGraphBounds();
  graphComponent.zoom = 1.0;

  createLegend();
  populateNodeTypeDropdown();
}

function applyLayout(graphComponent: GraphComponent, layoutType: any) {
  let layout;
  switch (layoutType) {
    case 'hierarchic':
      layout = new HierarchicLayout();
      break;
    case 'organic':
      layout = new OrganicLayout();
      break;
    case 'orthogonal':
      layout = new OrthogonalLayout();
      break;
    case 'circular':
      layout = new CircularLayout();
      break;
    default:
      layout = new HierarchicLayout();
  }
  const executor = new LayoutExecutor({
    graphComponent,
    layout,
    duration: 500 // Duration in milliseconds
  });
  executor.start().catch((error) => console.error('Layout execution failed:', error));
}

function applyGraphData(
  graphComponent: GraphComponent,
  data: { nodes: any[]; edges: any[]; groups?: any[] }
) {
  const graph = graphComponent.graph;
  graph.clear();

  const nodesMap = new Map<string, INode>();
  let typeToGroupMap = new Map<string, INode>();

  if (data.groups && data.groups.length > 0) {
    typeToGroupMap = createGroups(graph, data.groups);
  }

  data.nodes.forEach((node) => {
    const groupNode = node.type ? typeToGroupMap.get(node.type) : null;
    const color = getNodeColor(node.type);

    const newNode = graph.createNode({
      layout: new Rect(new Point(Math.random() * 800, Math.random() * 800), FIXED_NODE_SIZE),
      style: new ShapeNodeStyle({
        shape: 'ellipse', // Use ellipse shape for circular nodes
        fill: new SolidColorFill(color),
        stroke: new Stroke('black', 1.5)
      }),
      labels: [{
        text: node.label || node.id,
        style: new DefaultLabelStyle({
          wrapping: 'character-ellipsis',
          horizontalTextAlignment: 'center',
          verticalTextAlignment: 'center',
          textSize: 12,
          font: 'Arial'
        }),
        preferredSize: new Size(FIXED_NODE_SIZE.width - 10, FIXED_NODE_SIZE.height - 10)
      }]
    });
    if (groupNode) {
      graph.setParent(newNode, groupNode);
    }
    nodesMap.set(node.id, newNode);
  });

  createEdges(graph, data.edges, nodesMap);

  if (typeToGroupMap.size > 0) {
    adjustGroupNodes(graph);
  }

  graphComponent.fitGraphBounds();
  populateNodeTypeDropdown();
}

function createGroups(graph: IGraph, groups: any[]) {
  const typeToGroupMap = new Map();
  groups.forEach((group: { type: any }) => {
    if (!typeToGroupMap.has(group.type)) {
      const groupNodeStyle = new GroupNodeStyle({
        tabPosition: 'top-leading',
        cornerRadius: 10,
        contentAreaInsets: [15, 10, 10, 10],
        stroke: new Stroke('2px solid #2c3e50'),
        tabHeight: 24,
        tabWidth: 100
      });
      const groupNode = graph.createGroupNode({
        layout: new Rect(0, 0, 500, 300),
        style: groupNodeStyle
      });
      graph.addLabel(groupNode, group.type, InteriorLabelModel.NORTH);
      typeToGroupMap.set(group.type, groupNode);
    }
  });
  return typeToGroupMap;
}

function createEdges(graph: IGraph, edges: any[], nodesMap: Map<string, INode>) {
  edges.forEach((edge: { source: any; target: any }) => {
    const sourceNode = nodesMap.get(edge.source);
    const targetNode = nodesMap.get(edge.target);
    if (sourceNode && targetNode) {
      graph.createEdge(
        sourceNode,
        targetNode,
        new PolylineEdgeStyle({
          stroke: '2px solid black',
          targetArrow: new Arrow({ type: 'triangle', fill: 'black' })
        })
      );
    }
  });
}

function adjustGroupNodes(graph: IGraph) {
  graph.nodes
    .filter((node: any) => graph.isGroupNode(node))
    .forEach((groupNode: any) => {
      graph.adjustGroupNodeLayout(groupNode);
    });
}

let selectedNodes: INode[] = [];

function handleNodeClick(node: INode, graphComponent: GraphComponent) {
  console.log('Handling node click');
  selectedNodes.push(node);
  if (selectedNodes.length === 2) {
    highlightShortestPath(graphComponent);
    selectedNodes = [];
  }
}

function highlightShortestPath(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;
  if (selectedNodes.length !== 2) return;

  const [sourceNode, targetNode] = selectedNodes;

  const shortestPath = new ShortestPath({
    source: sourceNode,
    sink: targetNode,
    directed: false
  });

  const result = shortestPath.run(graph);

  if (!result) {
    console.log('No path found');
    return;
  }

  graph.edges.forEach((edge) =>
    graph.setStyle(
      edge,
      new PolylineEdgeStyle({
        stroke: '1px solid black',
        targetArrow: new Arrow({ type: 'triangle', fill: 'black' })
      })
    )
  );

  result.edges.forEach((edge) => {
    graph.setStyle(
      edge,
      new PolylineEdgeStyle({
        stroke: '3px solid red',
        targetArrow: new Arrow({ type: 'triangle', fill: 'red' })
      })
    );
  });

  graphComponent.invalidate();
}

function performGraphAnalysis(graphComponent: GraphComponent, analysisType: string) {
  switch (analysisType) {
    case 'betweenness':
      console.log('centrality clicked');
      calculateBetweennessCentrality(graphComponent);
      break;
    case 'modularity':
      performModularityClustering(graphComponent);
      break;
    default:
      console.error('Unknown analysis type:', analysisType);
  }
}

function calculateBetweennessCentrality(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;
  const centrality = new BetweennessCentrality();
  const result = centrality.run(graph);

  console.log('Centrality Results:', result.nodeCentrality.values);

  graph.nodes.forEach(node => {
    const centralityValue = result.nodeCentrality.get(node) || 0;
    console.log(`Node ${node.tag}: ${centralityValue}`);
    const nodeStyle = node.style.clone() as ShapeNodeStyle;
    nodeStyle.fill = getCentralityColor(centralityValue);
    graph.setStyle(node, nodeStyle);
  });
  graphComponent.invalidate();
}

function performModularityClustering(graphComponent: GraphComponent) {
  const graph = graphComponent.graph;
  const clustering = new LouvainModularityClustering();
  const result = clustering.run(graph);

  if (result.nodeClusterIds) {
    result.nodeClusterIds.forEach(entry => {
      const node = entry.key;
      const clusterId = entry.value;
      if (INode.isInstance(node)) {
        console.log(`Node ${node.tag} is in cluster ${clusterId}`);
        const nodeStyle = node.style.clone() as ShapeNodeStyle;
        nodeStyle.fill = getClusterColor(clusterId);
        graph.setStyle(node, nodeStyle);
      } else {
        console.error('Unexpected data type encountered: node is not an INode');
      }
    });
  } else {
    console.error('nodeClusterIds does not support forEach or is not correctly referenced');
  }

  graphComponent.invalidate();
}

function getCentralityColor(value: number): SolidColorFill {
  const intensity = Math.min(value * 255, 255);
  return new SolidColorFill(255, intensity, intensity);
}

function getClusterColor(clusterId: number): SolidColorFill {
  const colors = ['red', 'green', 'blue', 'yellow', 'purple'];
  return new SolidColorFill(colors[clusterId % colors.length]);
}

// Sidebar initialization
function initializeSidebar(graphComponent: GraphComponent) {
  // Initialize Node Styling Accordion
  const sidebarBody = document.querySelector('.offcanvas-body')
  const accordionDiv = document.createElement('div')
  accordionDiv.className = 'accordion'
  accordionDiv.id = 'nodeStylingAccordion'
  const accordionItem = document.createElement('div')
  accordionItem.className = 'accordion-item'
  accordionItem.innerHTML = `
    <h2 class="accordion-header" id="headingNodeStyling">
      <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseNodeStyling" aria-expanded="true" aria-controls="collapseNodeStyling">
        Node Styling
      </button>
    </h2>
    <div id="collapseNodeStyling" class="accordion-collapse collapse show" aria-labelledby="headingNodeStyling" data-bs-parent="#nodeStylingAccordion">
      <div class="accordion-body">
        <div class="mb-3">
          <label for="nodeTypeSelect" class="form-label">Node Type</label>
          <select id="nodeTypeSelect" class="form-select">
            <!-- Options will be populated dynamically -->
          </select>
        </div>
        <div class="mb-3">
          <label for="colorPicker" class="form-label">Color</label>
          <input type="color" id="colorPicker" class="form-control form-control-color" value="#ff0000">
        </div>
        <button id="applyColorButton" class="btn btn-primary">Apply Color</button>
      </div>
    </div>
  `
  accordionDiv.appendChild(accordionItem)
  sidebarBody?.appendChild(accordionDiv)

  // Event listener for apply color button
  document.getElementById('applyColorButton')!.addEventListener('click', () => {
    const nodeType = (document.getElementById('nodeTypeSelect') as HTMLSelectElement).value
    const color = (document.getElementById('colorPicker') as HTMLInputElement).value
    applyColorToNodeType(graphComponent, nodeType, color)
  })

  const searchInput = document.getElementById('node-search') as HTMLInputElement
  searchInput.addEventListener('input', () => {
    filterNodes(graphComponent, searchInput.value)
  })

  // Add buttons for toggling labels and isometric view
  const toggleLabelsButton = document.createElement('button')
  toggleLabelsButton.id = 'btn-toggle-labels'
  toggleLabelsButton.className = 'btn btn-secondary my-2'
  toggleLabelsButton.textContent = 'Toggle Labels'
  sidebarBody?.appendChild(toggleLabelsButton)

  const toggleIsometricButton = document.createElement('button')
  toggleIsometricButton.id = 'btn-toggle-isometric'
  toggleIsometricButton.className = 'btn btn-secondary my-2'
  toggleIsometricButton.textContent = 'Toggle Isometric View'
  sidebarBody?.appendChild(toggleIsometricButton)
}

function applyColorToNodeType(graphComponent: GraphComponent, nodeType: string, color: string) {
  nodeTypeColors.set(nodeType, color)
  graphComponent.graph.nodes.forEach(node => {
    if (node.tag === nodeType) {
      const nodeStyle = node.style.clone() as ShapeNodeStyle
      nodeStyle.fill = new SolidColorFill(color)
      graphComponent.graph.setStyle(node, nodeStyle)
    }
  })
  graphComponent.invalidate()
  updateLegend()
}

function filterNodes(graphComponent: GraphComponent, searchTerm: string) {
  const graph = graphComponent.graph
  graph.nodes.forEach(node => {
    const nodeName = node.labels.size > 0 ? node.labels.first().text : ''
    const matches = nodeName.toLowerCase().includes(searchTerm.toLowerCase())
    graph.setStyle(node, new ShapeNodeStyle({
      shape: 'ellipse', // Use ellipse shape for circular nodes
      fill: new SolidColorFill(getNodeColor(node.tag as string)),
      stroke: new Stroke('black', 1.5)
    }))
  })
  graphComponent.invalidate()
}

function addQuerySubmissionListener(graphComponent: GraphComponent) {
  document.getElementById('submitQueries')!.addEventListener('click', () => {
    const nodesQuery = (document.getElementById('nodesQuery') as HTMLInputElement).value
    const edgesQuery = (document.getElementById('edgesQuery') as HTMLInputElement).value
    const groupsQuery = (document.getElementById('groupsQuery') as HTMLInputElement).value
    fetch('http://localhost:8000/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nodesQuery, edgesQuery, groupsQuery })
    })
      .then((response) => response.json())
      .then((data) => {
        applyGraphData(graphComponent, data)
      })
      .catch((error) => console.error('Error:', error))
  })
}

function createLegend() {
  const legendContainer = document.getElementById('legend') || document.createElement('div');
  legendContainer.id = 'legend';
  legendContainer.innerHTML = '';
  legendContainer.style.position = 'absolute';
  legendContainer.style.right = '10px';
  legendContainer.style.top = '10px';
  legendContainer.style.backgroundColor = 'white';
  legendContainer.style.border = '1px solid black';
  legendContainer.style.padding = '10px';

  const legendTitle = document.createElement('div');
  legendTitle.style.fontWeight = 'bold';
  legendTitle.style.marginBottom = '5px';
  legendTitle.textContent = 'Node Type Legend';
  legendContainer.appendChild(legendTitle);

  for (const [type, color] of nodeTypeColors) {
    const legendItem = document.createElement('div');
    legendItem.style.display = 'flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.marginBottom = '5px';

    const colorBox = document.createElement('div');
    colorBox.style.width = '15px';
    colorBox.style.height = '15px';
    colorBox.style.backgroundColor = color;
    colorBox.style.marginRight = '5px';
    legendItem.appendChild(colorBox);

    const typeLabel = document.createElement('span');
    typeLabel.textContent = type;
    legendItem.appendChild(typeLabel);

    legendContainer.appendChild(legendItem);
  }

  document.body.appendChild(legendContainer);
}

function updateLegend() {
  const legendContainer = document.getElementById('legend');
  if (!legendContainer) {
    createLegend();
    return;
  }

  legendContainer.innerHTML = '';

  const legendTitle = document.createElement('div');
  legendTitle.style.fontWeight = 'bold';
  legendTitle.style.marginBottom = '5px';
  legendTitle.textContent = 'Node Type Legend';
  legendContainer.appendChild(legendTitle);

  for (const [type, color] of nodeTypeColors) {
    const legendItem = document.createElement('div');
    legendItem.style.display = 'flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.marginBottom = '5px';

    const colorBox = document.createElement('div');
    colorBox.style.width = '15px';
    colorBox.style.height = '15px';
    colorBox.style.backgroundColor = color;
    colorBox.style.marginRight = '5px';
    legendItem.appendChild(colorBox);

    const typeLabel = document.createElement('span');
    typeLabel.textContent = type;
    legendItem.appendChild(typeLabel);

    legendContainer.appendChild(legendItem);
  }
}

function toggleNodeLabels(graphComponent: GraphComponent) {
  nodeLabelsVisible = !nodeLabelsVisible
  const graph = graphComponent.graph
  graph.nodes.forEach(node => {
    if (nodeLabelsVisible) {
      const labelModel = new ExteriorLabelModel({ insets: 5 })
      if (node.labels.size === 0) {
        graph.addLabel(node, node.tag, labelModel.createParameter(ExteriorLabelModelPosition.SOUTH))
      }
    } else {
      node.labels.toArray().forEach(label => {
        graph.remove(label)
      })
    }
  })
}

function toggleIsometricView(graphComponent: GraphComponent) {
  isIsometricView = !isIsometricView
  if (isIsometricView) {
    const isometricMatrix = new Matrix(
      Math.cos(Math.PI / 6), -Math.cos(Math.PI / 6),
      Math.sin(Math.PI / 6), Math.sin(Math.PI / 6),
      0, 0
    )
    graphComponent.projection = isometricMatrix
  } else {
    graphComponent.projection = Matrix.IDENTITY
  }
  graphComponent.updateVisual()
}

function populateNodeTypeDropdown() {
  const nodeTypeSelect = document.getElementById('nodeTypeSelect') as HTMLSelectElement
  nodeTypeSelect.innerHTML = ''
  nodeTypeColors.forEach((color, type) => {
    const option = document.createElement('option')
    option.value = type
    option.textContent = type
    nodeTypeSelect.appendChild(option)
  })
}
