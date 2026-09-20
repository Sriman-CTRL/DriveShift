import { FileText, Folder, Image, Table, Presentation, FileCode, File } from 'lucide-react';

const MIME_MAP: Record<string, { icon: typeof File; label: string }> = {
  'application/vnd.google-apps.folder':       { icon: Folder,       label: 'Folder'       },
  'application/vnd.google-apps.document':     { icon: FileText,     label: 'Doc'          },
  'application/vnd.google-apps.spreadsheet':  { icon: Table,        label: 'Sheet'        },
  'application/vnd.google-apps.presentation': { icon: Presentation, label: 'Slides'       },
  'application/pdf':                           { icon: FileText,     label: 'PDF'          },
  'image/png':                                 { icon: Image,        label: 'Image'        },
  'image/jpeg':                                { icon: Image,        label: 'Image'        },
  'text/plain':                                { icon: FileCode,     label: 'Text'         },
};

export function mimeInfo(mimeType: string | null | undefined) {
  const entry = MIME_MAP[mimeType ?? ''];
  return {
    Icon:  entry?.icon  ?? File,
    label: entry?.label ?? 'File',
    isFolder: mimeType === 'application/vnd.google-apps.folder',
  };
}

interface Props {
  mimeType: string | null | undefined;
  className?: string;
  size?: number;
}

export function MimeIcon({ mimeType, className = '', size = 16 }: Props) {
  const { Icon } = mimeInfo(mimeType);
  return <Icon size={size} className={className} />;
}
