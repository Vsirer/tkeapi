/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState } from 'react';
import {
  resolveModelLogoSrc,
  isKnownDarkMonochromeLogo,
  detectIsDarkMonochromeImage,
} from '../utils/modelLogo';
import './ModelLogoIcon.css';

export type ModelLogoIconProps = {
  logo?: string | null;
  className?: string;
  size?: number;
  fallbackLetter?: string;
  style?: React.CSSProperties;
};

const ModelLogoIcon: React.FC<ModelLogoIconProps> = ({
  logo,
  className = 'hf-msp-trigger-logo',
  size = 16,
  fallbackLetter,
  style,
}) => {
  const src = resolveModelLogoSrc(logo);
  const [broken, setBroken] = useState(false);
  const [isDarkMono, setIsDarkMono] = useState(() => isKnownDarkMonochromeLogo(logo || src));

  useEffect(() => {
    setBroken(false);
    setIsDarkMono(isKnownDarkMonochromeLogo(logo || src));
  }, [src, logo]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!isDarkMono) {
      const isDark = detectIsDarkMonochromeImage(e.currentTarget);
      if (isDark) setIsDarkMono(true);
    }
  };

  if (src && !broken) {
    const invertClass = isDarkMono ? ' pg-model-logo-dark-invert' : '';
    return (
      <img
        src={src}
        alt=""
        crossOrigin="anonymous"
        className={`${className}${invertClass}`}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          flexShrink: 0,
          display: 'block',
          background: 'transparent',
          ...style,
        }}
        onLoad={handleLoad}
        onError={() => setBroken(true)}
      />
    );
  }

  if (fallbackLetter) {
    return (
      <span
        className={`${className} fallback`}
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.7),
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          color: '#bdbdbd',
          ...style,
        }}
      >
        {fallbackLetter.charAt(0)}
      </span>
    );
  }

  return <span className="hf-ig-chip-dot" aria-hidden style={style} />;
};

export default ModelLogoIcon;
