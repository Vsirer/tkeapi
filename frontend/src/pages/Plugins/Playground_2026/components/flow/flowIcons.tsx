/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * Imagine Flow 同款线型图标（从线上 SVG path 对齐，stroke 1.2）
 */
import React from 'react';

type IconProps = { size?: number; className?: string; title?: string };

const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: '0 0 18 18',
  fill: 'none' as const,
  xmlns: 'http://www.w3.org/2000/svg',
});

export const FlowIconContent: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M10.674 2.29687V4.46633C10.6733 5.52478 11.5161 6.38468 12.5576 6.38687H14.5777M10.3172 2.25003C10.7285 2.25003 11.1226 2.4201 11.4076 2.72231L14.2035 5.68451C14.4742 5.97066 14.6249 6.35243 14.6249 6.74953V12.8725C14.6357 14.4149 13.4427 15.6872 11.928 15.75L6.08264 15.7493C4.55365 15.715 3.34195 14.4273 3.37569 12.8725V4.9925C3.37569 3.4525 4.55 2.25 6.08264 2.25H10.3172Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconPlus: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M9 3.75V14.25M3.75 9H14.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconSearch: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M15.75 15.75L12.0002 12.0002M7.9615 13.6731C11.1159 13.6731 13.673 11.1159 13.673 7.96154C13.673 4.80714 11.1159 2.25 7.9615 2.25C4.80712 2.25 2.25 4.80714 2.25 7.96154C2.25 11.1159 4.80712 13.6731 7.9615 13.6731Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconAssets: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M14.167 13.75v1.667a1.667 1.667 0 0 1-1.667 1.667H4.167A1.667 1.667 0 0 1 2.5 15.417v-7.5A1.667 1.667 0 0 1 4.167 6.25h1.666M7.5 2.917H10l1.667 1.667h4.166A1.666 1.666 0 0 1 17.5 6.25v5.834a1.667 1.667 0 0 1-1.667 1.666H7.5a1.667 1.667 0 0 1-1.667-1.666v-7.5A1.667 1.667 0 0 1 7.5 2.917"
    />
  </svg>
);

export const FlowIconPresets: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M6.40385 12.5795H11.5962M11.5962 5.42045H11.0769C10.5261 5.42045 9.99782 5.63594 9.60832 6.01956C9.21881 6.40315 9 6.92342 9 7.46591V11.0455C9 11.4523 8.83588 11.8425 8.54376 12.1302C8.25164 12.4179 7.85543 12.5795 7.44231 12.5795M12.1154 14.625H15.2308C15.5175 14.625 15.75 14.3961 15.75 14.1136V11.0455C15.75 10.763 15.5175 10.5341 15.2308 10.5341H12.1154C11.8286 10.5341 11.5962 10.763 11.5962 11.0455V14.1136C11.5962 14.3961 11.8286 14.625 12.1154 14.625ZM2.76923 7.46591H5.88462C6.17135 7.46591 6.40385 7.23702 6.40385 6.95455V3.88636C6.40385 3.6039 6.17135 3.375 5.88462 3.375H2.76923C2.4825 3.375 2.25 3.6039 2.25 3.88636V6.95455C2.25 7.23702 2.4825 7.46591 2.76923 7.46591Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconBuilder: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M15.75 11.0782C15.7497 10.7139 15.6534 10.3561 15.471 10.0408C15.2885 9.72542 15.0263 9.4636 14.7106 9.28162C14.395 9.09963 14.037 9.00387 13.6726 9.00397C13.3082 9.00406 12.9502 9.1 12.6346 9.28215V6.40639C12.6346 6.13105 12.5252 5.86698 12.3304 5.67229C12.1357 5.47759 11.8716 5.36822 11.5962 5.36822H8.71963C8.90275 5.05263 8.99949 4.69491 9 4.33063C9.00051 3.96635 8.90477 3.60835 8.72278 3.29271C8.5408 2.97706 8.27898 2.71483 7.96363 2.5324C7.64828 2.34997 7.29045 2.25371 6.92615 2.25342C6.56187 2.25312 6.20387 2.34888 5.88826 2.53087C5.57264 2.71285 5.31033 2.97464 5.12784 3.28979C4.94536 3.60495 4.84909 3.96255 4.84868 4.32683C4.84828 4.69112 4.94374 5.04891 5.12562 5.3645H3.75C3.33579 5.3645 3 5.70028 3 6.1145V14.7395C3 15.1537 3.33579 15.4895 3.75 15.4895H14.25C14.6642 15.4895 15 15.1537 15 14.7395V11.0782H15.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconSettings: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" className={className}>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="m10.204 3.886-.577 1.537-1.984 1.163-1.581-.25a1.303 1.303 0 0 0-.77.13c-.24.12-.438.312-.57.55l-.537.969a1.421 1.421 0 0 0 .107 1.564l1.006 1.288v2.326l-.979 1.288a1.421 1.421 0 0 0-.107 1.565l.536.969c.133.237.332.429.57.55.239.12.507.165.77.13l1.582-.25 1.984 1.163.577 1.537c.088.236.254.436.474.568.22.133.478.19.736.163h1.103c.258.027.516-.03.736-.163.22-.132.386-.332.474-.568l.577-1.537 1.984-1.163 1.581.25c.263.035.531-.01.77-.13.24-.121.438-.313.57-.55l.537-.969a1.421 1.421 0 0 0-.107-1.565l-1.006-1.288v-2.326l.979-1.288a1.421 1.421 0 0 0 .107-1.564l-.536-.969a1.303 1.303 0 0 0-.57-.55 1.303 1.303 0 0 0-.77-.13l-1.582.25-1.984-1.163-.577-1.537a1.303 1.303 0 0 0-.474-.568 1.303 1.303 0 0 0-.736-.163h-1.103a1.303 1.303 0 0 0-.736.163 1.303 1.303 0 0 0-.474.568Z" />
    <circle cx="12" cy="12" r="2.5" stroke="currentColor" />
  </svg>
);

export const FlowIconKeyboard: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M5.963 2.254c.005.518.43.934.948.929h.732c.8-.007 1.454.635 1.465 1.435v.467m2.01 7.88H6.882m-1.73-4.9V8.05m5.124.017v-.017m-2.561.017v-.017m5.124.017v-.017m-3.844 2.176v-.017m-2.562.017v-.017m5.124.017v-.017m.613 5.54h-6.35c-2.21 0-3.578-1.232-3.571-3.497V8.594c0-2.265 1.368-3.504 3.578-3.504h6.343c2.203 0 3.579 1.26 3.579 3.56v3.448c0 2.265-1.368 3.497-3.579 3.497Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 帮助与资源（问号） */
export const FlowIconHelp: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="9" r="6.75" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M7.2 7.05c.2-.95.95-1.55 1.9-1.55 1.05 0 1.85.7 1.85 1.7 0 .85-.4 1.25-1.15 1.7-.7.4-.95.7-.95 1.35v.25"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="9" cy="13.05" r="0.7" fill="currentColor" />
  </svg>
);

export const FlowIconImage: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M6.56479 15.7515C6.07541 11.7452 11.6533 9.75017 15.7499 9.50208M15.7498 6.02052V11.9846C15.7498 14.1942 14.3677 15.7529 12.1593 15.7529H5.83317C3.62478 15.7529 2.25 14.1942 2.25 11.9846V6.02052C2.25 3.8109 3.63207 2.25293 5.83317 2.25293H12.1593C14.3677 2.25293 15.7498 3.8109 15.7498 6.02052ZM8.12154 7.33718C8.12154 8.04022 7.55207 8.61069 6.84876 8.61069C6.14614 8.61069 5.57666 8.04022 5.57666 7.33718C5.57666 6.63343 6.14614 6.06364 6.84876 6.06364C7.55207 6.06364 8.12154 6.63343 8.12154 7.33718Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconVideo: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M4.59229 11.2212H6.72316M12.3633 7.49349L14.9182 5.40235C15.3317 5.06342 15.9423 5.12424 16.2812 5.53776C16.4231 5.71128 16.501 5.92858 16.5001 6.15238L16.4912 11.8533C16.4896 12.3885 16.0558 12.8215 15.5206 12.8199C15.2977 12.8199 15.0812 12.742 14.9085 12.6001L12.3633 10.5098M9.48022 3.56592H4.38738C2.61247 3.56592 1.5 4.82271 1.5 6.60087V11.3994C1.5 13.1775 2.60679 14.4343 4.38738 14.4343H9.4794C11.26 14.4343 12.3684 13.1775 12.3684 11.3994V6.60087C12.3684 4.82271 11.26 3.56592 9.48022 3.56592Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconAudio: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M9 13.6731V15.75M9 13.6731C5.8934 13.6731 3.375 11.1159 3.375 7.96153M9 13.6731C12.1066 13.6731 14.625 11.1159 14.625 7.96153M12.0685 7.96152V5.3654C12.0685 3.64481 10.6948 2.25 9.00025 2.25C7.30574 2.25 5.93207 3.64481 5.93207 5.3654V7.96152C5.93207 9.68211 7.30574 11.0769 9.00025 11.0769C10.6948 11.0769 12.0685 9.68211 12.0685 7.96152Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 提示词节点：圆角框 + T，描边与其它 Flow 图标统一（18 viewBox / stroke 1.2） */
export const FlowIconPrompt: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className} aria-hidden>
    <rect
      x="2.4"
      y="2.4"
      width="13.2"
      height="13.2"
      rx="2.8"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path
      d="M6.2 6.6h5.6M9 6.6v5.2"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** @deprecated 提示词请用 FlowIconPrompt */
export const FlowIconText: React.FC<IconProps> = (props) => <FlowIconPrompt {...props} />;

export const FlowIconUpload: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M15.75 10.875V11.775C15.75 13.0351 15.75 13.6652 15.5048 14.1465C15.289 14.5698 14.9448 14.914 14.5215 15.1298C14.0402 15.375 13.4101 15.375 12.15 15.375H5.85C4.58988 15.375 3.95982 15.375 3.47852 15.1298C3.05516 14.914 2.71095 14.5698 2.49524 14.1465C2.25 13.6652 2.25 13.0351 2.25 11.775V10.875M5.25 6.375L9 2.625L12.75 6.375M9 2.625V11.625" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconSections: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M2.625 5.97414H6.3625C7.46707 5.97414 8.3625 5.07871 8.3625 3.97414V2.25M4.05937 15.75H13.845C14.69 15.75 15.375 15.1762 15.375 14.3534V3.73965C15.375 2.91694 14.69 2.25 13.845 2.25H4.155C3.31 2.25 2.625 2.91694 2.625 3.73965V14.3534C2.625 15.1762 3.21438 15.75 4.05937 15.75Z" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

/** 移动 / 选择（Imagine Move：指针） */
export const FlowIconMove: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path
      d="M4.2 3.1 5.05 13.9l2.55-2.35 1.85 3.95 1.85-.85-1.9-3.85 3.55-.35L4.2 3.1Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

/** 整理布局（Auto Layout）— 分层对齐示意 */
export const FlowIconAutoLayout: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="2.4" y="3.2" width="4.8" height="4.8" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="10.8" y="2.4" width="4.8" height="3.6" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="10.8" y="7.6" width="4.8" height="3.6" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="10.8" y="12.8" width="4.8" height="2.8" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M7.4 5.6H10.2M7.4 5.6L8.7 4.5M7.4 5.6L8.7 6.7"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** API 密钥 — 与操作栏同款圆润线型 */
export const FlowIconKey: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className} aria-hidden>
    <circle cx="6.4" cy="9" r="3.35" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="6.4" cy="9" r="1.15" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M9.55 9H15.35M15.35 9V11.55M12.95 9V10.85"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const FlowIconUndo: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M5.34734 13.7325H11.3473C13.4173 13.7325 15.0973 12.0525 15.0973 9.98246C15.0973 7.91246 13.4173 6.23246 11.3473 6.23246H3.09734M4.82234 8.10746L2.90234 6.18746L4.82234 4.26746" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconRedo: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <path d="M12.6523 13.7325H6.65234C4.58234 13.7325 2.90234 12.0525 2.90234 9.98246C2.90234 7.91246 4.58234 6.23246 6.65234 6.23246H14.9023M13.1773 8.10746L15.0973 6.18746L13.1773 4.26746" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FlowIconDirector: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="5.75" width="13" height="9.75" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M3.4 5.75 4.85 2.7h2.15L5.55 5.75M8.15 5.75 9.6 2.7h2.15L10.3 5.75M12.9 5.75 14.1 3.4"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M2.5 9.15h13" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const FlowIconMinimap: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg width={size} height={size} viewBox="9 9 16 16" fill="none" className={className}>
    <path d="M13.4395 9.34473V20.8913M18.5605 22.6401V11.0381M18.1498 22.6025L13.8502 21.0387C13.5868 20.943 13.2964 20.9533 13.0402 21.0671L10.3504 22.2624C9.83306 22.493 9.25 22.1143 9.25 21.5473V12.0491C9.25 11.4806 9.58494 10.9647 10.1045 10.7341L13.0402 9.42937C13.2964 9.31554 13.5868 9.30532 13.8502 9.40092L18.1498 10.9647C18.4132 11.0603 18.7037 11.0501 18.9598 10.9363L21.6496 9.74097C22.167 9.51111 22.75 9.88983 22.75 10.4561V19.955C22.75 20.5235 22.415 21.0387 21.8954 21.2692L18.9598 22.574C18.7037 22.6878 18.4132 22.698 18.1498 22.6025Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
