import {
  Button,
  DatePicker,
  Descriptions,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Modal,
  Pagination,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { useEffect, useMemo, useState } from 'react';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  FilterOutlined,
  DatabaseOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import {
  brandColor,
  colorPalette,
  typography,
  spacing,
  radius,
  shadows,
} from '../theme';

const { useBreakpoint } = Grid;
dayjs.extend(customParseFormat);

/* ─── theme shortcuts ─────────────────────────────────────────────────────── */
const c = {
  primary:    colorPalette.primary[500],
  primary400: colorPalette.primary[400],
  primary100: colorPalette.primary[100],
  primary50:  colorPalette.primary[50],
  success:    colorPalette.success[500],
  success50:  colorPalette.success[50],
  danger:     colorPalette.danger[500],
  danger50:   colorPalette.danger[50],
  warning:    colorPalette.warning[500],
  warning50:  colorPalette.warning[50],
  n50:        colorPalette.neutral[50],
  n100:       colorPalette.neutral[100],
  n200:       colorPalette.neutral[200],
  n300:       colorPalette.neutral[300],
  n400:       colorPalette.neutral[400],
  n500:       colorPalette.neutral[500],
  n600:       colorPalette.neutral[600],
  n700:       colorPalette.neutral[700],
  n800:       colorPalette.neutral[800],
  n900:       colorPalette.neutral[900],
  n950:       colorPalette.neutral[950],
};

/* ─── types ───────────────────────────────────────────────────────────────── */
type EditorKind = 'boolean' | 'number' | 'date' | 'datetime' | 'time' | 'json' | 'string' | 'select';

export interface FieldConfig {
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  kind?: EditorKind;
  options?: { label: string; value: string | number | boolean }[];
  placeholder?: string;
  extra?: string;
}

interface ResourceTablePageProps {
  title: string;
  subtitle: string;
  idField: string;
  listData: (args: { page: number; pageSize: number; search: string }) => Promise<{ rows: Record<string, unknown>[]; total: number }>;
  updateData: (id: string, patch: Record<string, unknown>) => Promise<void>;
  createData?: (payload: Record<string, unknown>) => Promise<void>;
  fieldConfigs?: Record<string, FieldConfig>;
  createTemplate?: Record<string, unknown>;
}

/* ─── helpers (unchanged logic) ──────────────────────────────────────────── */
const DATE_KEY_PATTERN = /(date|datetime|timestamp|_at|at$|expiry|expires|dob|birth|start|end)/i;
const TIME_KEY_PATTERN = /(time|hour|minute)/i;

function prettyValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function isBooleanLike(v: unknown): v is boolean { return typeof v === 'boolean'; }
function isNumberLike(v: unknown): v is number   { return typeof v === 'number' && Number.isFinite(v); }
function isComplexValue(v: unknown): v is object { return typeof v === 'object' && v !== null; }
function isDateOnlyString(v: string): boolean    { return /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isTimeString(v: string): boolean        { return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v); }
function isDayjsLike(v: unknown): v is { isValid:()=>boolean; format:(f?:string)=>string; toISOString:()=>string } {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.isValid === 'function' && typeof c.format === 'function' && typeof c.toISOString === 'function';
}
function inferFieldKind(key: string, value: unknown): EditorKind {
  if (isBooleanLike(value)) return 'boolean';
  if (isNumberLike(value))  return 'number';
  if (isComplexValue(value)) return 'json';
  const nk = key.toLowerCase();
  if (typeof value === 'string') {
    const raw = value.trim();
    if (isTimeString(raw) || (TIME_KEY_PATTERN.test(nk) && /^\d{1,2}:\d{2}/.test(raw))) return 'time';
    if (isDateOnlyString(raw)) return 'date';
    if (dayjs(raw).isValid() && DATE_KEY_PATTERN.test(nk)) return raw.includes('T') || raw.includes(':') ? 'datetime' : 'date';
  }
  if (value === null || value === undefined) {
    if (TIME_KEY_PATTERN.test(nk)) return 'time';
    if (DATE_KEY_PATTERN.test(nk)) return 'date';
  }
  return 'string';
}
function getKindLabel(k: EditorKind): string { return k === 'datetime' ? 'date-time' : k; }
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}
function getEditableKeys(record: Record<string, unknown>, idField: string): string[] {
  return Object.keys(record).filter(k => !['_id','id',idField,'createdAt','updatedAt','password','hashed_password'].includes(k));
}
function toFormValue(value: unknown, kind: EditorKind): unknown {
  if (kind === 'json') return isComplexValue(value) ? JSON.stringify(value, null, 2) : value;
  if (kind === 'date' || kind === 'datetime') {
    if (typeof value === 'string' || typeof value === 'number') { const p = dayjs(value); return p.isValid() ? p : undefined; }
    return undefined;
  }
  if (kind === 'time') {
    if (typeof value === 'string') {
      const n = isTimeString(value) ? (value.length === 5 ? `${value}:00` : value) : null;
      if (n) { const p = dayjs(`1970-01-01T${n}`); return p.isValid() ? p : undefined; }
      const p = dayjs(value); return p.isValid() ? p : undefined;
    }
    return undefined;
  }
  return value;
}
function fromFormValue(input: unknown, original: unknown, kind: EditorKind): unknown {
  if (kind === 'json') {
    if (typeof input === 'string') { try { return JSON.parse(input); } catch { return original; } }
    return input;
  }
  if (kind === 'number') {
    if (input === '' || input === null || input === undefined) return null;
    const n = Number(input); return Number.isFinite(n) ? n : original;
  }
  if (kind === 'boolean') return Boolean(input);
  if (kind === 'date') {
    if (!input) return null;
    if (isDayjsLike(input) && input.isValid()) return input.format('YYYY-MM-DD');
    return typeof input === 'string' ? input : original;
  }
  if (kind === 'datetime') {
    if (!input) return null;
    if (isDayjsLike(input) && input.isValid()) return input.toISOString();
    return typeof input === 'string' ? input : original;
  }
  if (kind === 'time') {
    if (!input) return null;
    if (isDayjsLike(input) && input.isValid()) return input.format('HH:mm:ss');
    return typeof input === 'string' ? input : original;
  }
  return input;
}

/* ─── small UI atoms ──────────────────────────────────────────────────────── */

/** Pill for boolean values */
function BoolPill({ value }: { value: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 9px', borderRadius: radius.full,
        fontSize: 11, fontWeight: 600,
        background: value ? c.success50 : c.danger50,
        color:      value ? c.success   : c.danger,
        border: `1px solid ${value ? colorPalette.success[200] : colorPalette.danger[200]}`,
      }}
    >
      {value ? <CheckOutlined style={{ fontSize: 9 }} /> : <CloseOutlined style={{ fontSize: 9 }} />}
      {value ? 'true' : 'false'}
    </span>
  );
}

/** Cell text — truncated with tooltip */
function CellText({ value }: { value: string }) {
  if (value === '—') return <span style={{ color: c.n300, fontSize: 13 }}>—</span>;
  return (
    <Tooltip title={value.length > 40 ? value : undefined}>
      <span
        style={{
          fontSize: 13, color: c.n700, display: 'block',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: 200,
        }}
      >
        {value}
      </span>
    </Tooltip>
  );
}

/** Section label inside modal forms */
function FieldLabel({ label, kind }: { label: React.ReactNode; kind: EditorKind }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: c.n700 }}>{label}</span>
      <span
        style={{
          fontSize: 10, fontWeight: 600,
          color: c.n400, background: c.n100,
          padding: '1px 6px', borderRadius: radius.full,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}
      >
        {getKindLabel(kind)}
      </span>
    </div>
  );
}

/** Count badge */
function CountBadge({ count, loading }: { count: number; loading: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 10px', borderRadius: radius.full,
        fontSize: 12, fontWeight: 700,
        background: c.primary50, color: c.primary,
        border: `1px solid ${c.primary100}`,
        minWidth: 36, justifyContent: 'center',
      }}
    >
      {loading ? '…' : count.toLocaleString()}
    </span>
  );
}

/* ─── main component ──────────────────────────────────────────────────────── */
export default function ResourceTablePage({
  title, subtitle, idField,
  listData, updateData, createData,
  fieldConfigs, createTemplate,
}: ResourceTablePageProps) {
  const screens    = useBreakpoint();
  const isMobile   = !screens.md;
  const isSmall    = !screens.sm;

  const [messageApi, contextHolder] = message.useMessage();
  const [editForm]   = Form.useForm();
  const [createForm] = Form.useForm();

  const [rows, setRows]       = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal]     = useState(0);

  const [editingRow, setEditingRow]           = useState<Record<string, unknown> | null>(null);
  const [editingFieldKinds, setEditingFieldKinds] = useState<Record<string, EditorKind>>({});
  const [savingEdit, setSavingEdit]           = useState(false);

  const [creating, setCreating]       = useState(false);
  const [createPayload, setCreatePayload] = useState('{}');
  const [savingCreate, setSavingCreate]   = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await listData({ page, pageSize, search });
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(); }, [page, pageSize]);

  const displayKeys = useMemo(() => {
    if (rows.length === 0) return [idField];
    const sample = rows[0];
    const keys   = Object.keys(sample).filter(k => !['id','_id','createdAt','updatedAt'].includes(k));
    const selected = keys.slice(0, 7);
    return sample[idField] === undefined ? selected : [idField, ...selected];
  }, [rows, idField]);

  const previewKeys = useMemo(() =>
    displayKeys.filter(k => k !== idField).slice(0, 4),
    [displayKeys, idField]
  );

  const openEditModal = (record: Record<string, unknown>) => {
    const editableKeys = getEditableKeys(record, idField);
    const initialValues: Record<string, unknown> = {};
    const kinds: Record<string, EditorKind> = {};
    editableKeys.forEach(key => {
      const config = fieldConfigs?.[key];
      const kind   = config?.kind ?? inferFieldKind(key, record[key]);
      kinds[key]   = kind;
      initialValues[key] = toFormValue(record[key], kind);
    });
    editForm.setFieldsValue(initialValues);
    setEditingFieldKinds(kinds);
    setEditingRow(record);
  };

  const openCreateModal = () => {
    if (createTemplate) {
      const initialValues: Record<string, unknown> = {};
      Object.entries(createTemplate).forEach(([key, value]) => {
        const config = fieldConfigs?.[key];
        const kind   = config?.kind ?? inferFieldKind(key, value);
        initialValues[key] = toFormValue(value, kind);
      });
      createForm.setFieldsValue(initialValues);
    }
    setCreating(true);
  };

  /* columns */
  const columns = useMemo<ColumnsType<Record<string, unknown>>>(() => {
    const generated: ColumnsType<Record<string, unknown>> = displayKeys.map(key => ({
      title: (
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: c.n500 }}>
          {key}
        </span>
      ),
      dataIndex: key,
      key,
      ellipsis: true,
      render: (value: unknown) =>
        isBooleanLike(value)
          ? <BoolPill value={value} />
          : <CellText value={prettyValue(value)} />,
    }));

    generated.push({
      title: '',
      key: 'actions',
      fixed: 'right',
      width: 68,
      render: (_: unknown, record: Record<string, unknown>) => (
        <button
          onClick={() => openEditModal(record)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 12px', borderRadius: radius.md,
            fontSize: 12, fontWeight: 600,
            background: c.primary50, color: c.primary,
            border: `1px solid ${c.primary100}`,
            cursor: 'pointer', transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = c.primary; el.style.color = '#fff';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = c.primary50; el.style.color = c.primary;
          }}
        >
          <EditOutlined style={{ fontSize: 11 }} /> Edit
        </button>
      ),
    });

    return generated;
  }, [displayKeys]);

  const handleSaveEdit = async () => {
    if (!editingRow) return;
    const idValue = editingRow[idField] ?? editingRow.id ?? editingRow.code;
    if (!idValue) { messageApi.error(`Unable to resolve ${idField}`); return; }

    const editableKeys = getEditableKeys(editingRow, idField);
    let parsed: Record<string, unknown>;

    try {
      const values = await editForm.validateFields();
      const patch: Record<string, unknown> = {};
      editableKeys.forEach(key => {
        const kind      = editingFieldKinds[key] ?? inferFieldKind(key, editingRow[key]);
        const nextValue = fromFormValue(values[key], editingRow[key], kind);
        if (!valuesEqual(nextValue, editingRow[key])) patch[key] = nextValue;
      });
      parsed = patch;
    } catch {
      messageApi.error('Please fix invalid fields before saving');
      return;
    }

    if (Object.keys(parsed).length === 0) { messageApi.info('No changes to save'); return; }

    setSavingEdit(true);
    try {
      await updateData(String(idValue), parsed);
      messageApi.success('Record updated');
      setEditingRow(null);
      setEditingFieldKinds({});
      editForm.resetFields();
      await loadRows();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreate = async () => {
    if (!createData) return;
    let payload: Record<string, unknown>;

    if (createTemplate) {
      try {
        const values = await createForm.validateFields();
        const np: Record<string, unknown> = {};
        Object.keys(values).forEach(key => {
          const config = fieldConfigs?.[key];
          const kind   = config?.kind ?? inferFieldKind(key, createTemplate[key]);
          np[key]      = fromFormValue(values[key], createTemplate[key], kind);
        });
        payload = np;
      } catch { messageApi.error('Please fix invalid fields'); return; }
    } else {
      try { payload = JSON.parse(createPayload); }
      catch { messageApi.error('Invalid JSON'); return; }
    }

    setSavingCreate(true);
    try {
      await createData(payload);
      messageApi.success('Record created');
      setCreating(false);
      setCreatePayload('{}');
      createForm.resetFields();
      await loadRows();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSavingCreate(false);
    }
  };

  /* field renderer */
  const renderField = (key: string, kind: EditorKind, originalValue: unknown) => {
    const config = fieldConfigs?.[key];
    const labelNode = <FieldLabel label={config?.label ?? key} kind={kind} />;

    const rules: any[] = [];
    if (config?.required || ['name','code','title','display_name'].includes(key)) {
      rules.push({ required: true, message: `${key} is required` });
    }

    const itemStyle: React.CSSProperties = {
      marginBottom: spacing.md,
    };

    if (kind === 'number') {
      const min = config?.min ?? (/(price|amount|count|capacity|properties|tenants|rooms|staff|total|value|order)/i.test(key) ? 0 : undefined);
      if (min !== undefined) rules.push({ type: 'number', min, message: `Min ${min}` });
      if (config?.max !== undefined) rules.push({ type: 'number', max: config.max, message: `Max ${config.max}` });
      return (
        <Form.Item key={key} label={labelNode} name={key} rules={rules} style={itemStyle}>
          <InputNumber
            style={{ width: '100%', borderRadius: radius.md }}
            placeholder={config?.placeholder}
          />
        </Form.Item>
      );
    }

    if (kind === 'boolean') {
      return (
        <Form.Item key={key} label={labelNode} name={key} valuePropName="checked" style={itemStyle}>
          <Switch />
        </Form.Item>
      );
    }

    if (kind === 'date') {
      return (
        <Form.Item key={key} label={labelNode} name={key} rules={rules} style={itemStyle}>
          <DatePicker style={{ width: '100%', borderRadius: radius.md }} format="YYYY-MM-DD" />
        </Form.Item>
      );
    }

    if (kind === 'datetime') {
      return (
        <Form.Item key={key} label={labelNode} name={key} rules={rules} style={itemStyle}>
          <DatePicker style={{ width: '100%', borderRadius: radius.md }} showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
      );
    }

    if (kind === 'time') {
      return (
        <Form.Item key={key} label={labelNode} name={key} rules={rules} style={itemStyle}>
          <TimePicker style={{ width: '100%', borderRadius: radius.md }} format="HH:mm:ss" />
        </Form.Item>
      );
    }

    if (kind === 'select' && config?.options) {
      return (
        <Form.Item key={key} label={labelNode} name={key} rules={rules} style={itemStyle}>
          <Select
            options={config.options}
            placeholder={config.placeholder}
            style={{ borderRadius: radius.md }}
          />
        </Form.Item>
      );
    }

    if (kind === 'json') {
      rules.push({
        validator: (_: any, value: any) => {
          if (!value) return Promise.resolve();
          try { JSON.parse(value); return Promise.resolve(); }
          catch { return Promise.reject('Invalid JSON'); }
        },
      });
      return (
        <Form.Item
          key={key} label={labelNode} name={key} rules={rules} style={itemStyle}
          extra={
            <span style={{ fontSize: 11, color: c.n400 }}>
              {config?.extra ?? 'Editing requires valid JSON structure.'}
            </span>
          }
        >
          <Input.TextArea
            rows={4}
            placeholder={config?.placeholder}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: 12, borderRadius: radius.md,
              background: c.n50,
            }}
          />
        </Form.Item>
      );
    }

    const isLong = (typeof originalValue === 'string' && originalValue.length > 100);
    return (
      <Form.Item key={key} label={labelNode} name={key} rules={rules} extra={config?.extra ? <span style={{ fontSize: 11, color: c.n400 }}>{config.extra}</span> : undefined} style={itemStyle}>
        {isLong
          ? <Input.TextArea rows={4} placeholder={config?.placeholder} style={{ borderRadius: radius.md }} />
          : <Input placeholder={config?.placeholder} style={{ borderRadius: radius.md }} />
        }
      </Form.Item>
    );
  };

  /* ── modal shared styles ── */
  const modalWidth = isMobile ? 'calc(100vw - 24px)' : 760;
  const modalTop   = isMobile ? 8 : 40;

  /* ── record id for display ── */
  const getRecordId = (record: Record<string, unknown>) =>
    prettyValue(record[idField] ?? record.id ?? record.code ?? 'Record');

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <>
      {contextHolder}

      {/* ── Page container ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>

        {/* ── Page header card ── */}
        <div
          style={{
            background: '#fff',
            borderRadius: radius.lg,
            border: `1px solid ${c.n200}`,
            boxShadow: shadows.sm,
            padding: isMobile ? `${spacing.md}px` : `${spacing.lg}px ${spacing.xl}px`,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          {/* Left: title + subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, minWidth: 0 }}>
            <div
              style={{
                width: 40, height: 40, borderRadius: radius.md, flexShrink: 0,
                background: c.primary50,
                border: `1px solid ${c.primary100}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: c.primary, fontSize: 18,
              }}
            >
              <DatabaseOutlined />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <h2 style={{
                  margin: 0, fontSize: isMobile ? 16 : 20,
                  fontWeight: 800, color: c.n900, letterSpacing: -0.4,
                }}>
                  {title}
                </h2>
                <CountBadge count={total} loading={loading} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: c.n400, marginTop: 2 }}>{subtitle}</p>
            </div>
          </div>

          {/* Right: create button */}
          {createData && (
            <button
              onClick={openCreateModal}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: `9px ${spacing.md}px`,
                borderRadius: radius.md, border: 'none',
                background: `linear-gradient(135deg, ${c.primary400}, ${c.primary})`,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', boxShadow: `0 2px 8px ${c.primary}44`,
                transition: 'all 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              <PlusOutlined style={{ fontSize: 13 }} />
              {!isSmall && `Add ${title}`}
            </button>
          )}
        </div>

        {/* ── Toolbar: search + refresh ── */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <div style={{ flex: 1, minWidth: 180, maxWidth: 360 }}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: c.n400, fontSize: 13 }} />}
              placeholder={`Search ${title.toLowerCase()}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onPressEnter={() => { setPage(1); loadRows(); }}
              onClear={() => { setSearch(''); setPage(1); loadRows(); }}
              style={{
                borderRadius: radius.full,
                background: c.n50,
                borderColor: c.n200,
                fontSize: 13,
              }}
            />
          </div>
          <Tooltip title="Refresh">
            <button
              onClick={() => { setPage(1); loadRows(); }}
              style={{
                width: 36, height: 36, borderRadius: radius.md,
                background: '#fff', border: `1px solid ${c.n200}`,
                color: c.n500, cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 14,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = c.primary; el.style.color = c.primary; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.borderColor = c.n200; el.style.color = c.n500; }}
            >
              <ReloadOutlined />
            </button>
          </Tooltip>

          {/* total count — visible on desktop */}
          {!isMobile && total > 0 && (
            <span style={{ fontSize: 12, color: c.n400, marginLeft: spacing.xs }}>
              {total.toLocaleString()} record{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Data area ── */}
        {isMobile ? (
          /* ── Mobile card list ── */
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: spacing.xl, color: c.n400, fontSize: 13 }}>
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div
                style={{
                  textAlign: 'center', padding: `${spacing.xl}px ${spacing.lg}px`,
                  background: '#fff', borderRadius: radius.lg,
                  border: `1px solid ${c.n200}`, color: c.n400, fontSize: 13,
                }}
              >
                No records found
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {rows.map((record, idx) => {
                  const recordId = getRecordId(record);
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#fff',
                        borderRadius: radius.lg,
                        border: `1px solid ${c.n200}`,
                        boxShadow: shadows.sm,
                        overflow: 'hidden',
                      }}
                    >
                      {/* card header */}
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: `${spacing.sm}px ${spacing.md}px`,
                          background: c.n50,
                          borderBottom: `1px solid ${c.n100}`,
                          gap: spacing.sm,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: c.n800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {recordId}
                        </div>
                        <button
                          onClick={() => openEditModal(record)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: radius.md, flexShrink: 0,
                            fontSize: 12, fontWeight: 600,
                            background: c.primary50, color: c.primary,
                            border: `1px solid ${c.primary100}`, cursor: 'pointer',
                          }}
                        >
                          <EditOutlined style={{ fontSize: 10 }} /> Edit
                        </button>
                      </div>

                      {/* fields grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isSmall ? '1fr' : '1fr 1fr',
                          gap: 0,
                        }}
                      >
                        {previewKeys.map((key, ki) => (
                          <div
                            key={key}
                            style={{
                              padding: `${spacing.sm}px ${spacing.md}px`,
                              borderBottom: ki < previewKeys.length - 1 ? `1px solid ${c.n100}` : undefined,
                              borderRight: !isSmall && ki % 2 === 0 ? `1px solid ${c.n100}` : undefined,
                            }}
                          >
                            <div style={{ fontSize: 10, fontWeight: 700, color: c.n400, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>
                              {key}
                            </div>
                            {isBooleanLike(record[key])
                              ? <BoolPill value={record[key] as boolean} />
                              : <span style={{ fontSize: 13, color: c.n700 }}>{prettyValue(record[key])}</span>
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* mobile pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: spacing.lg }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                size="small"
                onChange={(p, ps) => { setPage(p); setPageSize(ps || 25); }}
              />
            </div>
          </div>
        ) : (
          /* ── Desktop table ── */
          <div
            style={{
              background: '#fff',
              borderRadius: radius.lg,
              border: `1px solid ${c.n200}`,
              boxShadow: shadows.sm,
              overflow: 'hidden',
            }}
          >
            <Table
              rowKey={record => String(record[idField] ?? record.id ?? record.code ?? Math.random())}
              loading={loading}
              columns={columns}
              dataSource={rows}
              scroll={{ x: true }}
              size="middle"
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (t, range) => (
                  <span style={{ fontSize: 12, color: c.n400 }}>
                    {range[0]}–{range[1]} of {t.toLocaleString()}
                  </span>
                ),
                onChange: (p, ps) => { setPage(p); setPageSize(ps || 25); },
                style: { padding: `${spacing.sm}px ${spacing.lg}px` },
              }}
              style={{ fontFamily: typography.fontFamily.regular }}
              onRow={() => ({
                style: { transition: 'background 0.12s' },
                onMouseEnter: (e) => { (e.currentTarget as HTMLElement).style.background = c.n50; },
                onMouseLeave: (e) => { (e.currentTarget as HTMLElement).style.background = '#fff'; },
              })}
            />
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════
          EDIT MODAL
      ════════════════════════════════════════════ */}
      <Modal
        open={!!editingRow}
        onCancel={() => { setEditingRow(null); setEditingFieldKinds({}); editForm.resetFields(); }}
        onOk={handleSaveEdit}
        okText="Save Changes"
        cancelText="Cancel"
        confirmLoading={savingEdit}
        width={modalWidth}
        style={{ top: modalTop }}
        styles={{
          header: {
            padding: `${spacing.md}px ${spacing.lg}px`,
            borderBottom: `1px solid ${c.n100}`,
          },
          body: {
            padding: `${spacing.lg}px`,
            maxHeight: '70vh',
            overflowY: 'auto',
          },
          footer: {
            padding: `${spacing.sm}px ${spacing.lg}px`,
            borderTop: `1px solid ${c.n100}`,
          },
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <EditOutlined style={{ color: c.primary, fontSize: 15 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: c.n800 }}>Edit {title}</span>
            {editingRow && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600, color: c.n500,
                  background: c.n100, padding: '2px 8px', borderRadius: radius.full,
                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {getRecordId(editingRow)}
              </span>
            )}
          </div>
        }
        okButtonProps={{
          style: {
            background: `linear-gradient(135deg, ${c.primary400}, ${c.primary})`,
            border: 'none', borderRadius: radius.md, fontWeight: 600,
            boxShadow: `0 2px 6px ${c.primary}44`,
          },
        }}
        cancelButtonProps={{ style: { borderRadius: radius.md } }}
      >
        {editingRow && (
          <>
            <p style={{ margin: `0 0 ${spacing.md}px`, fontSize: 12, color: c.n400 }}>
              Field types are shown next to each label. Only changed fields will be saved.
            </p>
            <Form form={editForm} layout="vertical" requiredMark={false}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  columnGap: spacing.lg,
                }}
              >
                {getEditableKeys(editingRow, idField).map(key => {
                  const originalValue = editingRow[key];
                  const kind = editingFieldKinds[key] ?? inferFieldKind(key, originalValue);
                  return renderField(key, kind, originalValue);
                })}
              </div>
            </Form>
          </>
        )}
      </Modal>

      {/* ════════════════════════════════════════════
          CREATE MODAL
      ════════════════════════════════════════════ */}
      <Modal
        open={creating}
        onCancel={() => { setCreating(false); createForm.resetFields(); }}
        onOk={handleCreate}
        okText={`Create ${title}`}
        cancelText="Cancel"
        confirmLoading={savingCreate}
        width={modalWidth}
        style={{ top: modalTop }}
        styles={{
          header: {
            padding: `${spacing.md}px ${spacing.lg}px`,
            borderBottom: `1px solid ${c.n100}`,
          },
          body: {
            padding: `${spacing.lg}px`,
            maxHeight: '70vh',
            overflowY: 'auto',
          },
          footer: {
            padding: `${spacing.sm}px ${spacing.lg}px`,
            borderTop: `1px solid ${c.n100}`,
          },
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <PlusOutlined style={{ color: c.primary, fontSize: 15 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: c.n800 }}>Create {title}</span>
          </div>
        }
        okButtonProps={{
          style: {
            background: `linear-gradient(135deg, ${c.primary400}, ${c.primary})`,
            border: 'none', borderRadius: radius.md, fontWeight: 600,
            boxShadow: `0 2px 6px ${c.primary}44`,
          },
        }}
        cancelButtonProps={{ style: { borderRadius: radius.md } }}
      >
        {createTemplate ? (
          <Form form={createForm} layout="vertical" requiredMark={false}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                columnGap: spacing.lg,
              }}
            >
              {Object.entries(createTemplate).map(([key, value]) => {
                const config = fieldConfigs?.[key];
                const kind   = config?.kind ?? inferFieldKind(key, value);
                return renderField(key, kind, value);
              })}
            </div>
          </Form>
        ) : (
          <>
            <p style={{ fontSize: 12, color: c.n400, marginBottom: spacing.md }}>
              Provide a JSON document with the required fields for this entity.
            </p>
            <Input.TextArea
              rows={isMobile ? 12 : 16}
              value={createPayload}
              onChange={e => setCreatePayload(e.target.value)}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 12, borderRadius: radius.md, background: c.n50,
              }}
            />
          </>
        )}
      </Modal>
    </>
  );
}

export { ResourceTablePage };