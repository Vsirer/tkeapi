/*
 * tkeapi (tokensbyte) opensource
 * © 2026 tkeapi.com
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tkeapi.com/)
 */

import React, { useRef } from 'react';
import { Button, Dropdown, Modal, message, type MenuProps } from 'antd';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/theme';
import type { InvoiceConfig, InvoiceItem, ReceiptItem } from '../types';

interface InvoiceDocumentPreviewProps {
  invoice: InvoiceItem | null;
  receipt: ReceiptItem | null;
  onClose: () => void;
  config: InvoiceConfig;
  billedName: string;
  billedTaxId?: string;
  billedEmail?: string;
  billedPhone?: string;
  billedAddress?: string;
  accountId?: string;
  isEnterpriseCustomer?: boolean;
}

function maskDocNumber(val?: string, isEnterprise = false): string {
  if (!val) return '';
  const str = String(val).trim();
  if (str.includes('****')) return str;
  if (/^\d{17}[\dXx]$/i.test(str)) {
    return `${str.slice(0, 6)}****${str.slice(-4)}`;
  }
  if (isEnterprise) {
    return str;
  }
  if (str.length <= 6) return str;
  if (str.length <= 10) {
    return `${str.slice(0, 2)}****${str.slice(-2)}`;
  }
  return `${str.slice(0, 4)}****${str.slice(-4)}`;
}

const InvoiceDocumentPreview: React.FC<InvoiceDocumentPreviewProps> = ({
  invoice,
  receipt,
  onClose,
  config,
  billedName,
  billedTaxId,
  billedEmail,
  billedPhone,
  billedAddress,
  accountId,
  isEnterpriseCustomer = false,
}) => {
  const { t } = useTranslation();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const invoiceSheetRef = useRef<HTMLDivElement>(null);
  const receiptSheetRef = useRef<HTMLDivElement>(null);

  const handlePrint = (sheetOrTitle?: HTMLElement | string | null, docTitle?: string) => {
    let sheetElement: HTMLElement | null = null;
    let title = docTitle;
    if (typeof sheetOrTitle === 'string') {
      title = sheetOrTitle;
    } else if (sheetOrTitle) {
      sheetElement = sheetOrTitle;
    }
    const targetElement = sheetElement || (document.querySelector('.printable-a4-sheet') as HTMLElement | null);
    const originalTitle = document.title;
    if (title) {
      document.title = title;
    }

    if (!targetElement) {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1500);
      return;
    }

    const oldIframe = document.getElementById('tokensbyte-invoice-print-frame');
    if (oldIframe) {
      oldIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'tokensbyte-invoice-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '794px';
    iframe.style.height = '1123px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1500);
      return;
    }

    let stylesHtml = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      stylesHtml += node.outerHTML;
    });

    const sheetHtml = targetElement.outerHTML;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title || 'Invoice'}</title>
          ${stylesHtml}
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 210mm !important;
              height: 297mm !important;
              max-width: 210mm !important;
              max-height: 297mm !important;
              background: #ffffff !important;
              color: #0f172a !important;
              overflow: hidden !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif !important;
            }
            .printable-a4-sheet {
              position: relative !important;
              left: 0 !important;
              top: 0 !important;
              width: 210mm !important;
              height: 297mm !important;
              max-width: 210mm !important;
              max-height: 297mm !important;
              min-height: 297mm !important;
              padding: 2.54cm 2.0cm 2.54cm 2.0cm !important;
              margin: 0 auto !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              background: #ffffff !important;
              color: #0f172a !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              overflow: hidden !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .no-print {
              display: none !important;
            }
            .anticon {
              display: inline-block;
              color: inherit;
              font-style: normal;
              line-height: 0;
              text-align: center;
              text-transform: none;
              vertical-align: -0.125em;
              text-rendering: optimizeLegibility;
              -webkit-font-smoothing: antialiased;
            }
            .anticon > * {
              line-height: 1;
            }
            .anticon svg {
              display: inline-block;
            }
          </style>
        </head>
        <body>
          ${sheetHtml}
        </body>
      </html>
    `);
    doc.close();

    const cleanup = () => {
      document.title = originalTitle;
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.remove();
        }
      }, 1000);
    };

    if (iframe.contentWindow) {
      iframe.contentWindow.onafterprint = cleanup;
    }
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.remove();
      }
    }, 120000);

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('Print error:', e);
          window.print();
        } finally {
          document.title = originalTitle;
        }
      }, 300);
    };

    if (iframe.contentWindow?.document.readyState === 'complete') {
      doPrint();
    } else {
      iframe.onload = doPrint;
      setTimeout(doPrint, 600);
    }
  };

  const handleDownloadPdf = async (sheetElement: HTMLElement | null, docTitle: string) => {
    if (!sheetElement) {
      handlePrint(sheetElement, docTitle);
      return;
    }
    const hide = message.loading(t('invoices_page.generating_pdf', '正在生成标准高清 A4 单页 PDF 文件，请稍候...'), 0);
    try {
      const [html2canvasModule, jsPdfModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const html2canvas = (html2canvasModule.default || html2canvasModule) as any;
      const jsPDF = (jsPdfModule.jsPDF || jsPdfModule.default || jsPdfModule) as any;
      const canvas = await html2canvas(sheetElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      pdf.save(`${docTitle}.pdf`);
      hide();
      message.success(t('invoices_page.download_pdf_success', 'A4 单页 PDF 凭证已生成并开始下载'));
    } catch (err) {
      hide();
      console.error('PDF export error:', err);
      message.info(t('invoices_page.print_save_hint', '正在为您调起系统打印窗口（严格 A4 单页），可选择打印机或另存为 PDF'));
      handlePrint(sheetElement, docTitle);
    }
  };

  const getInvoiceMenuItems = (item: InvoiceItem): MenuProps['items'] => {
    const isGift = item.fund_type === 'gift_bonus';
    const docTitle = `${isGift ? 'Promotional-Gift' : 'Commercial-Invoice'}-${item.id}`;
    return [
      {
        key: 'download_pdf',
        icon: <DownloadOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_download_pdf', '下载 A4 单页 PDF')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_download_pdf_desc', '生成并保存独立标准 A4 单页 PDF 电子凭证')}</div>
          </div>
        ),
        onClick: () => handleDownloadPdf(invoiceSheetRef.current, docTitle),
      },
      { type: 'divider' },
      {
        key: 'print_pdf',
        icon: <PrinterOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_print_pdf', '直接打印 A4 单页')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_print_pdf_desc', '调起系统打印窗口，严格限制 1 张 A4 纸')}</div>
          </div>
        ),
        onClick: () => handlePrint(invoiceSheetRef.current, docTitle),
      },
    ];
  };

  const getReceiptMenuItems = (item: ReceiptItem): MenuProps['items'] => {
    const docTitle = `Payment-Receipt-${item.id}`;
    return [
      {
        key: 'download_pdf',
        icon: <DownloadOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_download_pdf', '下载 A4 单页 PDF')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_download_pdf_desc', '生成并保存独立标准 A4 单页 PDF 电子凭证')}</div>
          </div>
        ),
        onClick: () => handleDownloadPdf(receiptSheetRef.current, docTitle),
      },
      { type: 'divider' },
      {
        key: 'print_pdf',
        icon: <PrinterOutlined style={{ fontSize: 16, color: isLight ? '#18181b' : '#fafafa' }} />,
        label: (
          <div style={{ padding: '2px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('invoices_page.menu_print_pdf', '直接打印 A4 单页')}</div>
            <div style={{ fontSize: 11, color: isLight ? '#71717a' : '#a1a1aa' }}>{t('invoices_page.menu_print_pdf_desc', '调起系统打印窗口，严格限制 1 张 A4 纸')}</div>
          </div>
        ),
        onClick: () => handlePrint(receiptSheetRef.current, docTitle),
      },
    ];
  };

  const issuerBlock = (
    <div style={{ marginTop: 12 }}>
      {config.company_name && (
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
          {config.company_name}
        </div>
      )}
      {config.company_address && (
        <div style={{ fontSize: 11, color: '#475569', marginTop: 3, maxWidth: 360, lineHeight: 1.35 }}>
          {config.company_address}
        </div>
      )}
      {config.tax_id && (
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
          Tax ID: <strong>{config.tax_id}</strong>
        </div>
      )}
      {config.contact_email && (
        <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
          Billing Support: <strong>{config.contact_email}</strong>
        </div>
      )}
      {config.company_phone && (
        <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
          Tel: <strong>{config.company_phone}</strong>
        </div>
      )}
      {(config.company_website || config.website) && (
        <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
          Web: <strong>{config.company_website || config.website}</strong>
        </div>
      )}
    </div>
  );

  const billedPartyBlock = (
    <>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>
        {billedName}
      </div>
      {billedTaxId && (
        <div style={{ fontSize: 11, color: '#334155', marginTop: 2, fontWeight: 500 }}>
          <span style={{ color: '#64748b' }}>
            {isEnterpriseCustomer ? 'Tax ID: ' : 'ID / Tax Ref: '}
          </span>
          <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>
            {maskDocNumber(billedTaxId, isEnterpriseCustomer)}
          </strong>
        </div>
      )}
      {billedAddress && (
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.35 }}>
          {billedAddress}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}>
        {billedEmail || 'N/A'}
      </div>
      {billedPhone && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
          Tel: {billedPhone}
        </div>
      )}
      {accountId && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
          Account ID: {accountId}
        </div>
      )}
    </>
  );

  const a4SheetStyle: React.CSSProperties = {
    width: 794,
    height: 1123,
    minHeight: 1123,
    maxHeight: 1123,
    background: '#ffffff',
    color: '#0f172a',
    padding: '2.54cm 2.0cm',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
    borderRadius: 2,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const toolbarStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: isLight ? '#ffffff' : '#18181b',
    borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #27272a',
  };

  const modalStyles = {
    body: { padding: 0, overflow: 'hidden', background: isLight ? '#f1f5f9' : '#09090b', borderRadius: 8 },
  };

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          html, body {
            width: 210mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, .ant-modal-close, .ant-dropdown, .ant-modal-mask {
            display: none !important;
          }
          .ant-modal-wrap {
            position: static !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .ant-modal {
            position: static !important;
            width: 210mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            max-height: 297mm !important;
            padding: 0 !important;
            margin: 0 auto !important;
            top: 0 !important;
            transform: none !important;
          }
          .ant-modal-content {
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
          }
          .ant-modal-body {
            padding: 0 !important;
            margin: 0 !important;
          }
          .a4-preview-scroll {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            max-height: none !important;
            display: block !important;
          }
          .printable-a4-sheet {
            position: relative !important;
            width: 210mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            max-height: 297mm !important;
            min-height: 297mm !important;
            padding: 2.54cm 2.0cm 2.54cm 2.0cm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <Modal
        open={!!invoice}
        onCancel={onClose}
        footer={null}
        width={860}
        destroyOnClose
        centered
        styles={modalStyles}
      >
        {invoice && (() => {
          const isGiftInvoice = invoice.fund_type === 'gift_bonus';
          const menuItems = getInvoiceMenuItems(invoice);
          const docTitle = `${isGiftInvoice ? 'Promotional-Gift' : 'Commercial-Invoice'}-${invoice.id}`;
          return (
            <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
              <div>
                <div className="no-print" style={toolbarStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileTextOutlined style={{ color: isLight ? '#18181b' : '#fafafa', fontSize: 18 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: isLight ? '#0f172a' : '#f8fafc' }}>
                      {isGiftInvoice ? 'Promotional Gift Voucher' : 'Commercial Invoice'} · {invoice.id}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 28 }}>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownloadPdf(invoiceSheetRef.current, docTitle)}
                      style={{
                        borderRadius: 6,
                        fontWeight: 500,
                        background: isLight ? '#ffffff' : '#27272a',
                        borderColor: isLight ? '#e4e4e7' : '#3f3f46',
                        color: isLight ? '#18181b' : '#fafafa',
                      }}
                    >
                      {t('invoices_page.btn_download_pdf', 'Download PDF')}
                    </Button>
                    <Button
                      type="primary"
                      icon={<PrinterOutlined />}
                      onClick={() => handlePrint(invoiceSheetRef.current, docTitle)}
                      style={{ borderRadius: 6, fontWeight: 500 }}
                    >
                      {t('invoices_page.btn_print_direct', 'Print')}
                    </Button>
                  </div>
                </div>

                <div className="a4-preview-scroll" style={{ maxHeight: 'calc(88vh - 54px)', overflowY: 'auto', overflowX: 'auto', padding: '24px 16px 40px 16px', display: 'flex', justifyContent: 'center' }}>
                  <div ref={invoiceSheetRef} className="printable-a4-sheet" style={a4SheetStyle}>
                    <div>
                      <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '0.04em' }}>
                            {isGiftInvoice ? 'PROMOTIONAL VOUCHER' : 'INVOICE'}
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>
                            {isGiftInvoice ? 'Voucher No:' : 'Invoice No:'} {invoice.id}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Issue Date: {invoice.date}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                            Due Date: {invoice.date}
                          </div>
                          {issuerBlock}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                        <div>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                            BILLED TO:
                          </div>
                          {billedPartyBlock}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                            PAYMENT INFORMATION:
                          </div>
                          <div style={{ fontSize: 11.5, color: '#334155', marginTop: 3 }}>
                            Payment Method: <strong>{invoice.payment_method || 'Online Payment'}</strong>
                          </div>
                          <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}>
                            Payment Status: <strong style={{ color: '#0f172a' }}>
                              {isGiftInvoice ? 'Promotional Grant' : 'Paid'}
                            </strong>
                          </div>
                          <div style={{ fontSize: 11.5, color: '#334155', marginTop: 2 }}>
                            Currency: <strong>{invoice.currency === '¥' ? 'CNY' : 'USD'}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #0f172a' }}>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left', width: 32 }}>#</th>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left' }}>Item Description</th>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'center', width: 50 }}>Qty</th>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', width: 95 }}>Unit Price</th>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', width: 105 }}>Total Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#64748b' }}>1</td>
                              <td style={{ padding: '8px 8px', fontSize: 11.5, fontWeight: 600, color: '#0f172a' }}>
                                <div style={{ whiteSpace: 'nowrap' }}>
                                  {(!invoice.description || invoice.description === 'Account Credits & API Balance Top-up')
                                    ? (isGiftInvoice ? 'Promotional Gift Credits & Activity Bonus' : 'Purchase of Prepaid API Service Credits')
                                    : invoice.description}
                                </div>
                              </td>
                              <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#334155', textAlign: 'center' }}>1</td>
                              <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#334155', textAlign: 'right' }}>
                                {invoice.currency}{invoice.amount.toFixed(2)}
                              </td>
                              <td style={{ padding: '8px 8px', fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                                {invoice.currency}{invoice.amount.toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <div style={{ width: 250, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                            <span>Subtotal</span>
                            <span>{invoice.currency}{invoice.amount.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                            <span>Tax / VAT (0.0%)</span>
                            <span>{invoice.currency}0.00</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', marginTop: 3, borderTop: '2px solid #0f172a', fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                            <span>Total</span>
                            <span>{invoice.currency}{invoice.amount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 10.5, color: '#475569', lineHeight: 1.4 }}>
                        <div>
                          <strong style={{ color: '#0f172a' }}>Terms & Notes: </strong>
                          {config.notes || 'Thank you for your business! Payment has been processed in full.'}
                        </div>
                        <div style={{ marginTop: 3, color: '#64748b' }}>
                          <strong style={{ color: '#0f172a' }}>Tax Note: </strong>
                          Tax exempt / Reverse charge (Zero-rated VAT/GST on cross-border B2B digital cloud services).
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8' }}>
                        <span>Document Ref: {invoice.id} · {isGiftInvoice ? 'Promotional Gift Voucher' : 'Official Commercial Invoice'}</span>
                        <span style={{ fontWeight: 600 }}>Page 1 of 1</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Dropdown>
          );
        })()}
      </Modal>

      <Modal
        open={!!receipt}
        onCancel={onClose}
        footer={null}
        width={860}
        destroyOnClose
        centered
        styles={modalStyles}
      >
        {receipt && (() => {
          const menuItems = getReceiptMenuItems(receipt);
          const docTitle = `Payment-Receipt-${receipt.id}`;
          return (
            <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
              <div>
                <div className="no-print" style={toolbarStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileTextOutlined style={{ color: isLight ? '#18181b' : '#fafafa', fontSize: 18 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: isLight ? '#0f172a' : '#f8fafc' }}>
                      Payment Receipt · {receipt.id}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 28 }}>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownloadPdf(receiptSheetRef.current, docTitle)}
                      style={{
                        borderRadius: 6,
                        fontWeight: 500,
                        background: isLight ? '#ffffff' : '#27272a',
                        borderColor: isLight ? '#e4e4e7' : '#3f3f46',
                        color: isLight ? '#18181b' : '#fafafa',
                      }}
                    >
                      {t('invoices_page.btn_download_pdf', 'Download PDF')}
                    </Button>
                    <Button
                      type="primary"
                      icon={<PrinterOutlined />}
                      onClick={() => handlePrint(receiptSheetRef.current, docTitle)}
                      style={{ borderRadius: 6, fontWeight: 500 }}
                    >
                      {t('invoices_page.btn_print_direct', 'Print')}
                    </Button>
                  </div>
                </div>

                <div className="a4-preview-scroll" style={{ maxHeight: 'calc(88vh - 54px)', overflowY: 'auto', overflowX: 'auto', padding: '24px 16px 40px 16px', display: 'flex', justifyContent: 'center' }}>
                  <div ref={receiptSheetRef} className="printable-a4-sheet" style={a4SheetStyle}>
                    <div>
                      <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '0.04em' }}>
                            RECEIPT
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginTop: 3 }}>
                            Receipt No: {receipt.id}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Payment Date: {(receipt.date || '').replace(/GMT/g, 'UTC')}
                          </div>
                          {issuerBlock}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '12px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircleOutlined style={{ fontSize: 24, color: '#0f172a' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                              Payment Successfully Cleared
                            </div>
                            <div style={{ fontSize: 12, color: '#52525b', marginTop: 2 }}>
                              Processed via {receipt.payment_method || 'Online Payment Gateway'}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#52525b', fontWeight: 700 }}>
                            AMOUNT RECEIVED
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                            {receipt.currency}{receipt.amount.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 14, padding: '12px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                        <div>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                            RECEIVED FROM (PAYER):
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                            {billedName}
                          </div>
                          {billedTaxId && (
                            <div style={{ fontSize: 11, color: '#334155', marginTop: 2, fontWeight: 500 }}>
                              <span style={{ color: '#64748b' }}>
                                {isEnterpriseCustomer ? 'Tax ID: ' : 'ID / Tax Ref: '}
                              </span>
                              <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                                {maskDocNumber(billedTaxId, isEnterpriseCustomer)}
                              </strong>
                            </div>
                          )}
                          {billedAddress && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.35 }}>
                              {billedAddress}
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                            {billedEmail || 'N/A'}
                          </div>
                          {billedPhone && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                              Tel: {billedPhone}
                            </div>
                          )}
                          {accountId && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                              Account ID: {accountId}
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                            TRANSACTION SUMMARY:
                          </div>
                          <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
                            Receipt #: <strong>{receipt.id}</strong>
                          </div>
                          {receipt.transaction_id && (
                            <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>
                              Transaction Ref: <strong style={{ fontFamily: 'monospace' }}>{receipt.transaction_id}</strong>
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                            Payment Gateway: <strong>{receipt.payment_method || 'Online'}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #0f172a' }}>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left', width: 32 }}>#</th>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'left' }}>Description</th>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'center', width: 115 }}>Payment Method</th>
                              <th style={{ padding: '7px 8px', fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', width: 105 }}>Paid Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#64748b' }}>1</td>
                              <td style={{ padding: '8px 8px', fontSize: 11.5, fontWeight: 600, color: '#0f172a' }}>
                                <div style={{ whiteSpace: 'nowrap' }}>Purchase of Prepaid API Service Credits</div>
                                <div style={{ fontSize: 10.5, fontWeight: 400, color: '#64748b', marginTop: 2 }}>Instant Settlement Confirmation</div>
                              </td>
                              <td style={{ padding: '8px 8px', fontSize: 11.5, color: '#334155', textAlign: 'center' }}>
                                {receipt.payment_method || 'Online Payment'}
                              </td>
                              <td style={{ padding: '8px 8px', fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                                {receipt.currency}{receipt.amount.toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <div style={{ width: 250, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                            <span>Subtotal</span>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{receipt.currency}{receipt.amount.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5, color: '#475569' }}>
                            <span>Tax / VAT (0.0%)</span>
                            <span>{receipt.currency}0.00</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', marginTop: 3, borderTop: '2px solid #0f172a', fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                            <span>Total Paid</span>
                            <span>{receipt.currency}{receipt.amount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 10.5, color: '#475569', lineHeight: 1.4 }}>
                        <div>
                          <strong style={{ color: '#0f172a' }}>Official Receipt Note: </strong>
                          This document serves as an official confirmation of electronic fund transfer and payment receipt. Payment has been verified and settled to the designated account.
                        </div>
                        <div style={{ marginTop: 3, color: '#64748b' }}>
                          <strong style={{ color: '#0f172a' }}>Tax Note: </strong>
                          Tax exempt / Reverse charge (Zero-rated VAT/GST on cross-border B2B digital cloud services).
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8' }}>
                        <span>Receipt Ref: {receipt.id} · Payment Voucher</span>
                        <span style={{ fontWeight: 600 }}>Page 1 of 1</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Dropdown>
          );
        })()}
      </Modal>
    </>
  );
};

export default InvoiceDocumentPreview;
