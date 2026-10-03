/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tkeapi.com/)
 */

import React from 'react';

interface SmartSvgIconProps {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

/** 原样显示图标文件，与站点图标库预览一致，不按主题反色。 */
const SmartSvgIcon: React.FC<SmartSvgIconProps> = ({ src, alt = "", style = {}, className, onError }) => {
  return (
    <img
      src={src}
      alt={alt}
      style={style}
      className={className}
      onError={onError}
    />
  );
};

export default SmartSvgIcon;
