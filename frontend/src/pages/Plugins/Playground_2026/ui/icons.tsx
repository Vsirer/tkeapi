/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Ant Design 图标名 → lucide-react（Imagine 同款线型图标栈）
 */
import React from 'react';
import type { LucideProps } from 'lucide-react';
import {
  LayoutGrid, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Bell, Palette,
  BookOpen, Square, CheckCircle2, CircleCheck, Check, Eraser,   Clock3, XCircle,
  X, Cloud, Compass, Minimize2, SlidersHorizontal, Copy, LayoutDashboard,
  Trash2, DollarSign, ChevronDown, ChevronRight, Download, Pencil, MoreHorizontal,
  AlertCircle, Expand, Maximize2, ExternalLink, FileText, FolderPlus,
  Folder, FolderOpen, Type, Minimize, Globe, Heart, History, Info, Key,
  Link2, Loader2, Lock, Menu, MessageSquare, Paperclip, PauseCircle, Image,
  PlayCircle, PlusCircle, Plus, UserRound, Pin, RotateCcw, RotateCw, RefreshCw, Bot,
  Move, Eye, EyeOff,
  CalendarClock, Search, Settings, Share2, ArrowUpAZ, Volume2, Star,
  Zap, Undo2, Unlock, List, ChevronUp, Upload, User, Video, ArrowUpRight,
} from 'lucide-react';

type IconProps = LucideProps & { style?: React.CSSProperties; className?: string; spin?: boolean };

const wrap = (Icon: React.ComponentType<LucideProps>, defaultSize = 16) => {
  const Comp: React.FC<IconProps> = ({ size, style, className, spin, ...rest }) => {
    const fontSize = style?.fontSize;
    const resolved =
      size ??
      (typeof fontSize === 'number' ? fontSize : typeof fontSize === 'string' ? parseFloat(fontSize) || defaultSize : defaultSize);
    return (
      <Icon
        size={resolved}
        strokeWidth={1.5}
        className={className}
        style={{
          ...style,
          ...(spin ? { animation: 'pg-ui-spin 0.8s linear infinite' } : null),
        }}
        {...rest}
      />
    );
  };
  Comp.displayName = (Icon as any).displayName || 'PgIcon';
  return Comp;
};

const filled = (Icon: React.ComponentType<LucideProps>) => {
  const Base = wrap(Icon);
  const Comp: React.FC<IconProps> = (props) => <Base fill="currentColor" {...props} />;
  Comp.displayName = `${(Icon as any).displayName || 'Icon'}Filled`;
  return Comp;
};

export const AppstoreOutlined = wrap(LayoutGrid);
export const ArrowLeftOutlined = wrap(ArrowLeft);
export const ArrowRightOutlined = wrap(ArrowRight);
export const ArrowUpOutlined = wrap(ArrowUp);
export const AudioOutlined = wrap(AudioLines);
export const BellOutlined = wrap(Bell);
export const BgColorsOutlined = wrap(Palette);
export const BookOutlined = wrap(BookOpen);
export const BorderOutlined = wrap(Square);
export const CheckCircleFilled = filled(CheckCircle2);
export const CheckCircleOutlined = wrap(CircleCheck);
export const CheckOutlined = wrap(Check);
export const ClearOutlined = wrap(Eraser);
export const ClockCircleOutlined = wrap(Clock3);
export const CloseCircleOutlined = wrap(XCircle);
export const CloseOutlined = wrap(X);
export const CloudOutlined = wrap(Cloud);
export const CompassOutlined = wrap(Compass);
export const CompressOutlined = wrap(Minimize2);
export const ControlOutlined = wrap(SlidersHorizontal);
export const CopyOutlined = wrap(Copy);
export const DashboardOutlined = wrap(LayoutDashboard);
export const DeleteOutlined = wrap(Trash2);
export const DollarOutlined = wrap(DollarSign);
export const DownOutlined = wrap(ChevronDown);
export const RightOutlined = wrap(ChevronRight);
export const DownloadOutlined = wrap(Download);
export const EditOutlined = wrap(Pencil);
export const EllipsisOutlined = wrap(MoreHorizontal);
export const ExclamationCircleOutlined = wrap(AlertCircle);
export const ExpandAltOutlined = wrap(Expand);
export const ExpandOutlined = wrap(Maximize2);
export const EyeInvisibleOutlined = wrap(EyeOff);
export const EyeOutlined = wrap(Eye);
export const ExportOutlined = wrap(ExternalLink);
export const FileTextOutlined = wrap(FileText);
export const FolderAddOutlined = wrap(FolderPlus);
export const FolderFilled = filled(Folder);
export const FolderOpenOutlined = wrap(FolderOpen);
export const FolderOutlined = wrap(Folder);
export const FontSizeOutlined = wrap(Type);
export const FullscreenExitOutlined = wrap(Minimize);
export const FullscreenOutlined = wrap(Maximize2);
export const GlobalOutlined = wrap(Globe);
export const HeartFilled = filled(Heart);
export const HeartOutlined = wrap(Heart);
export const HistoryOutlined = wrap(History);
export const InfoCircleOutlined = wrap(Info);
export const KeyOutlined = wrap(Key);
export const LinkOutlined = wrap(Link2);
const LoadingIcon = wrap(Loader2);
export const LoadingOutlined: React.FC<IconProps> = (props) => <LoadingIcon spin {...props} />;
export const LockFilled = filled(Lock);
export const LockOutlined = wrap(Lock);
export const MenuOutlined = wrap(Menu);
export const MessageOutlined = wrap(MessageSquare);
export const PaperClipOutlined = wrap(Paperclip);
export const PauseCircleOutlined = wrap(PauseCircle);
export const PictureOutlined = wrap(Image);
export const PlayCircleOutlined = wrap(PlayCircle);
export const PlusCircleOutlined = wrap(PlusCircle);
export const PlusOutlined = wrap(Plus);
export const ProfileOutlined = wrap(UserRound);
export const PushpinFilled = filled(Pin);
export const PushpinOutlined = wrap(Pin);
export const DragMoveOutlined = wrap(Move);
export const RedoOutlined = wrap(RotateCcw);
export const RotateRightOutlined = wrap(RotateCw);
export const ReloadOutlined = wrap(RefreshCw);
export const RobotOutlined = wrap(Bot);
export const ScheduleOutlined = wrap(CalendarClock);
export const SearchOutlined = wrap(Search);
export const SettingOutlined = wrap(Settings);
export const ShareAltOutlined = wrap(Share2);
export const SortAscendingOutlined = wrap(ArrowUpAZ);
export const SoundOutlined = wrap(Volume2);
export const StarFilled = filled(Star);
export const StarOutlined = wrap(Star);
export const ThunderboltOutlined = wrap(Zap);
export const UndoOutlined = wrap(Undo2);
export const UnlockOutlined = wrap(Unlock);
export const UnorderedListOutlined = wrap(List);
export const UpOutlined = wrap(ChevronUp);
export const UploadOutlined = wrap(Upload);
export const UserOutlined = wrap(User);
export const VideoCameraOutlined = wrap(Video);
export const ArrowUpRightOutlined = wrap(ArrowUpRight);
