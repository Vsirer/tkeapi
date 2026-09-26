/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import type React from 'react';

type StorageProviderKey = 'tos' | 'cos' | string;

interface RegionItem {
  label: string;
  region: string;
  endpointExternal: string;
  endpointInternal: string;
}

export interface RegionGroup {
  group: string;
  regions: RegionItem[];
}

export interface StorageProviderMeta {
  key: StorageProviderKey;
  name: string;
  shortName: string;
  brand: string;
  tag?: string;
  description: string;
  icon?: React.ReactNode;
  brandColor?: string;
  docUrl?: string;
  fieldKeys: {
    keyId: string;
    keyIdLabel: string;
    keyIdPlaceholder: string;
    keySecret: string;
    keySecretLabel: string;
    keySecretPlaceholder: string;
    region: string;
    endpoint: string;
    bucket: string;
    bucketExtra?: string;
    pathPrefix: string;
    customDomain: string;
  };
  regionGroups: RegionGroup[];
  allRegions: RegionItem[];
  detectNetworkType: (endpoint?: string) => 'external' | 'internal';
  resolveEndpoint: (region: string, networkType: 'external' | 'internal') => string;
  isConfigured: (values: Record<string, any>) => boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}
