import { GraphComponent, INode, AdjacencyTypes, IEdge, ShapeNodeStyle, SolidColorFill, Stroke, Rect, PolylineEdgeStyle, Arrow, Animator, DefaultLabelStyle, IAnimation, Size, TimeSpan, IModelItem, PopulateItemContextMenuEventArgs, GraphViewerInputMode, ICommand } from 'yfiles'
import { getNodeColor, loadAndProcessCSVFiles } from './main'
import { ContextMenu } from './lib/ContextMenu'
import './context-menu.css'

export function initializeContextMenu(graphComponent: GraphComponent): void {
  const inputMode = graphComponent.inputMode as GraphViewerInputMode

  const contextMenu = new ContextMenu(graphComponent)

  contextMenu.addOpeningEventListeners(graphComponent, (location) => {
    if (
      inputMode.contextMenuInputMode.shouldOpenMenu(
        graphComponent.toWorldFromPage(location)
      )
    ) {
      contextMenu.show(location)
    }
  })

  inputMode.addPopulateItemContextMenuListener((_, evt) =>
    populateContextMenu(contextMenu, graphComponent, evt)
  )

  inputMode.contextMenuInputMode.addCloseMenuListener(() => {
    contextMenu.close()
  })

  contextMenu.onClosedCallback = () => {
    inputMode.contextMenuInputMode.menuClosed()
  }
}

function populateContextMenu(
  contextMenu: ContextMenu,
  graphComponent: GraphComponent,
  args: PopulateItemContextMenuEventArgs<IModelItem>
): void {
  args.showMenu = true

  contextMenu.clearItems()

  const node = args.item instanceof INode ? args.item : null
  updateSelection(graphComponent, node)

  const selectedNodes = graphComponent.selection.selectedNodes
  if (selectedNodes.size > 0) {
    contextMenu.addMenuItem('Zoom to node', () => {
      let targetRect = selectedNodes.at(0)!.layout.toRect()
      selectedNodes.forEach((node) => {
        targetRect = Rect.add(targetRect, node.layout.toRect())
      })
      graphComponent.zoomToAnimated(targetRect.getEnlarged(100))
    })

    if (selectedNodes.size === 1) {
      const selectedNode = selectedNodes.at(0)
      if (selectedNode!.tag && (selectedNode!.tag as string).startsWith('aggregated')) {
        contextMenu.addMenuItem('Expand', () => {
          expandNode(selectedNode!, graphComponent)
        })
      } else {
        contextMenu.addMenuItem('Aggregate', () => {
          aggregateNodes(selectedNode!, graphComponent)
        })
      }
    }
  } else {
    contextMenu.addMenuItem('Fit Graph Bounds', () =>
      ICommand.FIT_GRAPH_BOUNDS.execute(null, graphComponent)
    )
  }
}

function updateSelection(
  graphComponent: GraphComponent,
  node: INode | null
): void {
  if (node === null) {
    graphComponent.selection.clear()
  } else if (!graphComponent.selection.selectedNodes.isSelected(node)) {
    graphComponent.selection.clear()
    graphComponent.selection.selectedNodes.setSelected(node, true)
    graphComponent.currentItem = node
  }
}

function aggregateNodes(node: INode, graphComponent: GraphComponent) {
  const graph = graphComponent.graph
  const type = node.tag as string
  const nodesToAggregate = graph.nodes.filter((n) => n.tag === type).toArray()

  const aggregatedNode = graph.createNode({
    layout: new Rect(node.layout.center, new Size(80, 80)), // Bigger size for aggregated node
    style: new ShapeNodeStyle({
      shape: 'ellipse',
      fill: new SolidColorFill(getNodeColor(type)),
      stroke: new Stroke('black', 2)
    }),
    tag: `aggregated-${type}`,
    labels: [
      {
        text: `${type} (${nodesToAggregate.length})`,
        style: new DefaultLabelStyle({
          wrapping: 'character-ellipsis',
          horizontalTextAlignment: 'center',
          verticalTextAlignment: 'center',
          textSize: 12,
          font: 'Arial'
        })
      }
    ]
  })

  const edgesToKeep = new Set<IEdge>()
  nodesToAggregate.forEach((n) => {
    graph.edgesAt(n, AdjacencyTypes.INCOMING).forEach((e) => {
      edgesToKeep.add(e)
      if (e.sourceNode!.tag !== `aggregated-${type}`) {
        graph.createEdge(e.sourceNode!, aggregatedNode, e.style)
      }
    })
    graph.edgesAt(n, AdjacencyTypes.OUTGOING).forEach((e) => {
      edgesToKeep.add(e)
      if (e.targetNode!.tag !== `aggregated-${type}`) {
        graph.createEdge(aggregatedNode, e.targetNode!, e.style)
      }
    })
  })

  nodesToAggregate.forEach((n) => graph.remove(n))

  edgesToKeep.forEach((e) => {
    const source = e.sourceNode === node ? aggregatedNode : e.sourceNode!
    const target = e.targetNode === node ? aggregatedNode : e.targetNode!
    if (source !== target) {
      graph.createEdge(source, target, e.style)
    }
  })

  animateAggregation(graphComponent, aggregatedNode)
}

function expandNode(aggregatedNode: INode, graphComponent: GraphComponent) {
  const graph = graphComponent.graph
  const type = (aggregatedNode.tag as string).split('-')[1]

  graph.clear()

  loadAndProcessCSVFiles(
    graphComponent,
    (window as any).uploadedNodes,
    (window as any).uploadedEdges,
    (window as any).uploadedGroups
  )
}

function animateAggregation(graphComponent: GraphComponent, aggregatedNode: INode) {
  const animator = new Animator(graphComponent)
  const layoutAnimation = IAnimation.createNodeAnimation(
    graphComponent.graph,
    aggregatedNode,
    aggregatedNode.layout.toRect(),
    TimeSpan.fromMilliseconds(0)
  )
  animator.animate(layoutAnimation).catch((err) => console.error(err))
}

function animateExpansion(graphComponent: GraphComponent, newNodes: INode[]) {
  const animator = new Animator(graphComponent)
  const animations: IAnimation[] = newNodes.map((node) =>
    IAnimation.createNodeAnimation(
      graphComponent.graph,
      node,
      node.layout.toRect(),
      TimeSpan.fromMilliseconds(0)
    )
  )
  const parallelAnimation = IAnimation.createParallelAnimation(animations)
  animator.animate(parallelAnimation).catch((err) => console.error(err))
}
