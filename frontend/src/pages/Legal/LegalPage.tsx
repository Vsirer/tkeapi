/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, Typography, ConfigProvider, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import { sanitizeHtml } from '../../utils/sanitize';
import { DEFAULT_TOS_ZH, DEFAULT_TOS_EN, DEFAULT_PRIVACY_ZH, DEFAULT_PRIVACY_EN } from '../../constants/agreements';

const LegalPage: React.FC = () => {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { i18n } = useTranslation();
  const requestedLanguage = searchParams.get('lang');
  const legalLanguage = requestedLanguage === 'en' || requestedLanguage === 'zh'
    ? requestedLanguage
    : null;
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (legalLanguage && i18n.language !== legalLanguage) {
      void i18n.changeLanguage(legalLanguage);
    }
  }, [legalLanguage, i18n]);

  useEffect(() => {
    if (type !== 'terms' && type !== 'privacy') {
      navigate('/dashboard');
      return;
    }

    const fetchLegalContent = async () => {
      const isEn = legalLanguage ? legalLanguage === 'en' : Boolean(i18n.language?.startsWith('en'));
      const defaultTos = isEn ? DEFAULT_TOS_EN : DEFAULT_TOS_ZH;
      const defaultPrivacy = isEn ? DEFAULT_PRIVACY_EN : DEFAULT_PRIVACY_ZH;

      try {
        const response = await (request.get('/settings') as any);
        const agreement = response?.agreement;
        
        if (!agreement) {
          setTitle(type === 'terms' ? (isEn ? 'Terms of Service' : '服务条款 (Terms of Service)') : (isEn ? 'Privacy Policy' : '隐私政策 (Privacy Policy)'));
          setContent(type === 'terms' ? defaultTos : defaultPrivacy);
          setLoading(false);
          return;
        }

        if (type === 'terms') {
          setTitle(isEn ? 'Terms of Service' : '服务条款 (Terms of Service)');
          if (isEn ? agreement.tos_mode_en === 'link' : agreement.tos_mode === 'link') {
            const link = isEn && agreement.tos_link_en ? agreement.tos_link_en : agreement.tos_link;
            if (link) {
              // URL 协议白名单校验，防止开放重定向
              try {
                const parsed = new URL(link);
                if (['http:', 'https:'].includes(parsed.protocol)) {
                  window.location.href = link;
                  return;
                }
              } catch { /* 非法 URL，忽略 */ }
            }
          }
          const textContent = isEn && agreement.tos_content_en ? agreement.tos_content_en : (agreement.tos_content || defaultTos);
          setContent(textContent || defaultTos);
        } else if (type === 'privacy') {
          setTitle(isEn ? 'Privacy Policy' : '隐私政策 (Privacy Policy)');
          if (isEn ? agreement.privacy_mode_en === 'link' : agreement.privacy_mode === 'link') {
            const link = isEn && agreement.privacy_link_en ? agreement.privacy_link_en : agreement.privacy_link;
            if (link) {
              // URL 协议白名单校验，防止开放重定向
              try {
                const parsed = new URL(link);
                if (['http:', 'https:'].includes(parsed.protocol)) {
                  window.location.href = link;
                  return;
                }
              } catch { /* 非法 URL，忽略 */ }
            }
          }
          const textContent = isEn && agreement.privacy_content_en ? agreement.privacy_content_en : (agreement.privacy_content || defaultPrivacy);
          setContent(textContent || defaultPrivacy);
        }
        
      } catch (error) {
        console.error('Failed to fetch legal settings:', error);
        setTitle(type === 'terms' ? (isEn ? 'Terms of Service' : '服务条款 (Terms of Service)') : (isEn ? 'Privacy Policy' : '隐私政策 (Privacy Policy)'));
        setContent(type === 'terms' ? defaultTos : defaultPrivacy);
      } finally {
        setLoading(false);
      }
    };

    fetchLegalContent();
  }, [type, navigate, i18n.language, legalLanguage]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ConfigProvider theme={{  }}>
      <div style={{ 
        minHeight: '100vh', 
        background: '#0a0a0a', 
        color: '#e5e5e5',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          maxWidth: 860, 
          width: '100%', 
          margin: '0 auto', 
          padding: '60px 24px',
          flex: 1
        }}>
          <Typography.Title level={2} style={{ color: '#fff', textAlign: 'center', marginBottom: 40, fontWeight: 600 }}>
            {title}
          </Typography.Title>
          
          <div 
            className="ql-editor"
            style={{ 
              background: 'transparent', 
              padding: 0,
              fontSize: '15px',
              lineHeight: 1.8,
              color: 'rgba(255, 255, 255, 0.85)'
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} 
          />
        </div>
      </div>
    </ConfigProvider>
  );
};

export default LegalPage;
