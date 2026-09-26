/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from 'antd';
import { PlusOutlined, CloseOutlined, HolderOutlined } from '@ant-design/icons';

type Item = { id: string; value: string };

type Props = {
  options: string[];
  onChange?: (next: string[]) => void;
  isLight: boolean;
  labelOf?: (opt: string) => string;
  /** 只展示，不可排序/增删改（关联尺寸列表） */
  readOnly?: boolean;
};

function parseStoredOption(raw: string): string {
  const s = raw.trim();
  if (s === '智能') return 'auto';
  return s;
}

function toItems(options: string[]): Item[] {
  return options.filter(Boolean).map((value, i) => ({ id: `isp-opt-${i}-${value}`, value }));
}

function pillStyle(isLight: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 32,
    padding: '0 6px 0 8px',
    borderRadius: 8,
    background: isLight ? '#fff' : '#f4f4f5',
    color: '#111',
    border: isLight ? '1px solid #e4e4e7' : '1px solid transparent',
    userSelect: 'none',
    fontSize: 13,
    lineHeight: '32px',
    boxShadow: extra?.boxShadow,
    ...extra,
  };
}

const SortablePill: React.FC<{
  item: Item;
  isLight: boolean;
  label: string;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ item, isLight, label, onEdit, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <span
      ref={setNodeRef}
      style={pillStyle(isLight, {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 2 : undefined,
      })}
    >
      <span
        {...attributes}
        {...listeners}
        title="拖动排序"
        style={{
          cursor: 'grab',
          color: '#a1a1aa',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 2px',
          touchAction: 'none',
        }}
      >
        <HolderOutlined />
      </span>
      <span onClick={onEdit} title="点击修改" style={{ cursor: 'text' }}>
        {label || '…'}
      </span>
      <CloseOutlined
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{ fontSize: 10, color: '#71717a', padding: 2, cursor: 'pointer' }}
      />
    </span>
  );
};

const ImageSpecialOptionTags: React.FC<Props> = ({
  options,
  onChange,
  isLight,
  labelOf = (o) => o,
  readOnly = false,
}) => {
  const [items, setItems] = useState<Item[]>(() => toItems(options));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setItems(toItems(options));
  }, [options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const ids = useMemo(
    () => items.filter((it) => it.id !== editingId).map((it) => it.id),
    [items, editingId],
  );
  const activeItem = items.find((it) => it.id === activeId) || null;

  const commitList = (next: Item[]) => {
    setItems(next);
    onChange?.(next.map((it) => it.value));
  };

  const commitEdit = (id: string, raw: string) => {
    const nextVal = parseStoredOption(raw);
    if (!nextVal) {
      commitList(items.filter((it) => it.id !== id));
      setEditingId(null);
      return;
    }
    if (items.some((it) => it.id !== id && it.value === nextVal)) {
      setEditingId(null);
      return;
    }
    commitList(items.map((it) => (it.id === id ? { ...it, value: nextVal } : it)));
    setEditingId(null);
  };

  const commitAdd = (raw: string) => {
    const nextVal = parseStoredOption(raw);
    setAdding(false);
    setAddDraft('');
    if (!nextVal) return;
    if (items.some((it) => it.value === nextVal)) return;
    commitList([...items, { id: `isp-opt-${items.length}-${nextVal}`, value: nextVal }]);
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setEditingId(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commitList(arrayMove(items, oldIndex, newIndex));
  };

  if (readOnly) {
    if (!items.length) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {items.map((item) => (
          <span key={item.id} style={pillStyle(isLight, { padding: '0 10px' })}>
            {labelOf(item.value) || item.value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          {items.map((item) => {
            if (editingId === item.id) {
              return (
                <Input
                  key={item.id}
                  size="small"
                  autoFocus
                  value={draft}
                  placeholder="输入选项"
                  style={{ width: 88, height: 32, borderRadius: 8 }}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitEdit(item.id, draft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitEdit(item.id, draft);
                    }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              );
            }
            return (
              <SortablePill
                key={item.id}
                item={item}
                isLight={isLight}
                label={labelOf(item.value)}
                onEdit={() => {
                  setEditingId(item.id);
                  setDraft(item.value === 'auto' ? '智能' : item.value);
                }}
                onRemove={() => commitList(items.filter((it) => it.id !== item.id))}
              />
            );
          })}
        </SortableContext>
        <DragOverlay zIndex={2400} dropAnimation={null}>
          {activeItem ? (
            <span style={pillStyle(isLight, { boxShadow: '0 8px 24px rgba(0,0,0,0.28)', cursor: 'grabbing' })}>
              <HolderOutlined style={{ color: '#a1a1aa' }} />
              <span>{labelOf(activeItem.value)}</span>
            </span>
          ) : null}
        </DragOverlay>
      </DndContext>
      {adding ? (
        <Input
          size="small"
          autoFocus
          value={addDraft}
          placeholder="输入选项"
          style={{ width: 88, height: 32, borderRadius: 8 }}
          onChange={(e) => setAddDraft(e.target.value)}
          onBlur={() => commitAdd(addDraft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitAdd(addDraft);
            }
            if (e.key === 'Escape') {
              setAdding(false);
              setAddDraft('');
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setAdding(true);
            setAddDraft('');
          }}
          title="添加选项"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: isLight ? '1px dashed #d4d4d8' : '1px dashed #52525b',
            background: 'transparent',
            color: isLight ? '#52525b' : '#a1a1aa',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <PlusOutlined />
        </button>
      )}
    </div>
  );
};

export default ImageSpecialOptionTags;
