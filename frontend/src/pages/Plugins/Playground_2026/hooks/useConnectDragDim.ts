/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 拖出连接线时：不可连接节点面板变淡 class
 */
import { useMemo } from 'react';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';
import { shouldDimNodeDuringConnectDrag } from '../utils/flowConnectDragHighlight';

const DIM_CLASS = 'is-connect-incompatible';

export function useConnectDragDimClass(nodeId: string): string {
  const { connectingSourceId, connectingToInput, nodes } = useCanvas();
  const { models } = usePlayground();

  return useMemo(() => {
    const dim = shouldDimNodeDuringConnectDrag(
      nodeId,
      nodes,
      models,
      connectingSourceId,
      connectingToInput,
    );
    return dim ? DIM_CLASS : '';
  }, [nodeId, nodes, models, connectingSourceId, connectingToInput]);
}
