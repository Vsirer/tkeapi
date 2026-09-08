/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 创作中心主内容区：按 Tab 懒加载重模块，memo 隔离侧栏收展重渲
 */
import React, { Suspense, memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkAlbum } from '../utils/albumsApi';

const WorksList = React.lazy(() => import('./WorksList'));
const ImageGenerateWorkspace = React.lazy(() => import('./ImageGenerateWorkspace'));
const VideoGenerateWorkspace = React.lazy(() => import('./VideoGenerateWorkspace'));
const WorkflowList = React.lazy(() => import('./WorkflowList'));

export type HomeMainTab =
  | 'assets-all'
  | 'assets-works'
  | 'assets-uploads'
  | 'assets-favorites'
  | 'assets-album'
  | 'images'
  | 'videos'
  | 'workflows';

type PlaygroundHomeMainProps = {
  activeTab: HomeMainTab;
  activeAlbumId: string;
  albums: WorkAlbum[];
  loadAlbums: () => void | Promise<void>;
  /** 工作流列表变更后刷新侧栏额度等 */
  onWorkflowsChange?: () => void | Promise<void>;
  isMobile?: boolean;
  workflowMenuTitle?: string;
};

const PaneFallback: React.FC = () => (
  <div
    aria-busy="true"
    style={{
      flex: 1,
      minHeight: 240,
      opacity: 0.35,
    }}
  />
);

const PlaygroundHomeMain: React.FC<PlaygroundHomeMainProps> = ({
  activeTab,
  activeAlbumId,
  albums,
  loadAlbums,
  onWorkflowsChange,
  workflowMenuTitle,
}) => {
  const { t } = useTranslation();

  const isAssets =
    activeTab === 'assets-all' ||
    activeTab === 'assets-works' ||
    activeTab === 'assets-uploads' ||
    activeTab === 'assets-favorites' ||
    activeTab === 'assets-album';

  return (
    <div
      className={
        activeTab === 'images' || activeTab === 'videos' ? undefined : 'pg-ig-content'
      }
      style={{
        flex: 1,
        overflowY: activeTab === 'images' || activeTab === 'videos' ? 'hidden' : 'auto',
        padding:
          activeTab === 'images' || activeTab === 'videos'
            ? 0
            : undefined,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Suspense fallback={<PaneFallback />}>
        {isAssets ? (
          <div
            key={activeTab === 'assets-album' ? `album-${activeAlbumId}` : activeTab}
            className="pg-ig-view-transition"
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            <WorksList
              mode={
                activeTab === 'assets-favorites'
                  ? 'favorites'
                  : activeTab === 'assets-album'
                    ? 'album'
                    : 'all'
              }
              sourceType={
                activeTab === 'assets-uploads'
                  ? 'upload'
                  : activeTab === 'assets-works'
                    ? 'work'
                    : undefined
              }
              albumId={activeTab === 'assets-album' ? activeAlbumId : undefined}
              albums={albums}
              onAlbumsChange={loadAlbums}
              title={
                activeTab === 'assets-favorites'
                  ? t('playground_2026:favorites', '收藏夹')
                  : activeTab === 'assets-album'
                    ? albums.find((a) => a.id === activeAlbumId)?.name ||
                      t('playground_2026:assets', '资产')
                    : activeTab === 'assets-uploads'
                      ? t('playground_2026:uploads', '上传')
                      : activeTab === 'assets-works'
                        ? t('playground_2026:works', '作品')
                        : t('playground_2026:all_assets', '资产素材库')
              }
              description={
                activeTab === 'assets-favorites'
                  ? t('playground_2026:favorites_desc', '收藏的图片与视频资源。')
                  : activeTab === 'assets-album'
                    ? undefined
                    : activeTab === 'assets-uploads'
                      ? t(
                          'playground_2026:uploads_desc',
                          '手动上传的图片与视频。',
                        )
                      : activeTab === 'assets-works'
                        ? t(
                            'playground_2026:works_desc',
                            '生成产生的图片与视频作品。',
                          )
                        : t(
                            'playground_2026:all_assets_desc',
                            '查看全部图片与视频资源，包含作品与上传。',
                          )
              }
            />
          </div>
        ) : activeTab === 'images' ? (
          <ImageGenerateWorkspace embedded />
        ) : activeTab === 'videos' ? (
          <VideoGenerateWorkspace embedded />
        ) : (
          <WorkflowList onWorkflowsChange={onWorkflowsChange} workflowMenuTitle={workflowMenuTitle} />
        )}
      </Suspense>
    </div>
  );
};

export default memo(PlaygroundHomeMain);
