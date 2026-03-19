import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Modal,
  Pagination,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { useEffect, useMemo, useState } from 'react';

const { useBreakpoint } = Grid;
dayjs.extend(customParseFormat);

type EditorKind = 'boolean' | 'number' | 'date' | 'datetime' | 'time' | 'json' | 'string';

const DATE_KEY_PATTERN = /(date|datetime|timestamp|_at|at$|expiry|expires|dob|birth|start|end)/i;
const TIME_KEY_PATTERN = /(time|hour|minute)/i;

interface ResourceTablePageProps {
  title: string;
  subtitle: string;
  idField: string;
  listData: (args: { page: number; pageSize: number; search: string }) => Promise<{ rows: Record<string, unknown>[]; total: number }>;
  updateData: (id: string, patch: Record<string, unknown>) => Promise<void>;
  createData?: (payload: Record<string, unknown>) => Promise<void>;
}

function prettyValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isBooleanLike(value: unknown): boolean {
  return typeof value === 'boolean';
}

function isNumberLike(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isComplexValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function isDateOnlyString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function isDayjsLike(
  value: unknown
): value is { isValid: () => boolean; format: (formatString?: string) => string; toISOString: () => string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.isValid === 'function' &&
    typeof candidate.format === 'function' &&
    typeof candidate.toISOString === 'function'
  );
}

function inferFieldKind(key: string, value: unknown): EditorKind {
  if (isBooleanLike(value)) {
    return 'boolean';
  }

  if (isNumberLike(value)) {
    return 'number';
  }

  if (isComplexValue(value)) {
    return 'json';
  }

  const normalizedKey = key.toLowerCase();

  if (typeof value === 'string') {
    const raw = value.trim();

    if (isTimeString(raw) || (TIME_KEY_PATTERN.test(normalizedKey) && /^\d{1,2}:\d{2}/.test(raw))) {
      return 'time';
    }

    if (isDateOnlyString(raw)) {
      return 'date';
    }

    if (dayjs(raw).isValid() && DATE_KEY_PATTERN.test(normalizedKey)) {
      if (raw.includes('T') || raw.includes(':')) {
        return 'datetime';
      }
      return 'date';
    }
  }

  if (value === null || value === undefined) {
    if (TIME_KEY_PATTERN.test(normalizedKey)) {
      return 'time';
    }
    if (DATE_KEY_PATTERN.test(normalizedKey)) {
      return 'date';
    }
  }

  return 'string';
}

function getKindLabel(kind: EditorKind): string {
  switch (kind) {
    case 'datetime':
      return 'date-time';
    default:
      return kind;
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (typeof left === 'object' && typeof right === 'object' && left !== null && right !== null) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  return false;
}

function getEditableKeys(record: Record<string, unknown>, idField: string): string[] {
  return Object.keys(record).filter(
    (key) => !['_id', 'id', idField, 'createdAt', 'updatedAt', 'password', 'hashed_password'].includes(key)
  );
}

function toFormValue(value: unknown, kind: EditorKind): unknown {
  if (kind === 'json') {
    return isComplexValue(value) ? JSON.stringify(value, null, 2) : value;
  }

  if (kind === 'date' || kind === 'datetime') {
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = dayjs(value);
      return parsed.isValid() ? parsed : undefined;
    }
    return undefined;
  }

  if (kind === 'time') {
    if (typeof value === 'string') {
      const normalized = isTimeString(value) ? (value.length === 5 ? `${value}:00` : value) : null;
      if (normalized) {
        const parsed = dayjs(`1970-01-01T${normalized}`);
        return parsed.isValid() ? parsed : undefined;
      }

      const parsed = dayjs(value);
      return parsed.isValid() ? parsed : undefined;
    }
    return undefined;
  }

  return value;
}

function fromFormValue(inputValue: unknown, originalValue: unknown, kind: EditorKind): unknown {
  if (kind === 'json') {
    return originalValue;
  }

  if (kind === 'number') {
    if (inputValue === '' || inputValue === null || inputValue === undefined) {
      return null;
    }
    const parsed = Number(inputValue);
    return Number.isFinite(parsed) ? parsed : originalValue;
  }

  if (kind === 'boolean') {
    return Boolean(inputValue);
  }

  if (kind === 'date') {
    if (!inputValue) {
      return null;
    }

    if (isDayjsLike(inputValue) && inputValue.isValid()) {
      return inputValue.format('YYYY-MM-DD');
    }

    return typeof inputValue === 'string' ? inputValue : originalValue;
  }

  if (kind === 'datetime') {
    if (!inputValue) {
      return null;
    }

    if (isDayjsLike(inputValue) && inputValue.isValid()) {
      return inputValue.toISOString();
    }

    return typeof inputValue === 'string' ? inputValue : originalValue;
  }

  if (kind === 'time') {
    if (!inputValue) {
      return null;
    }

    if (isDayjsLike(inputValue) && inputValue.isValid()) {
      return inputValue.format('HH:mm:ss');
    }

    return typeof inputValue === 'string' ? inputValue : originalValue;
  }

  return inputValue;
}

export default function ResourceTablePage({ title, subtitle, idField, listData, updateData, createData }: ResourceTablePageProps) {
  const screens = useBreakpoint();
  const isCompact = !screens.md;
  const [messageApi, contextHolder] = message.useMessage();
  const [editForm] = Form.useForm();

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [editingFieldKinds, setEditingFieldKinds] = useState<Record<string, EditorKind>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createPayload, setCreatePayload] = useState('{}');
  const [savingCreate, setSavingCreate] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const response = await listData({ page, pageSize, search });
      setRows(response.rows);
      setTotal(response.total);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const displayKeys = useMemo(() => {
    if (rows.length === 0) {
      return [idField];
    }

    const sample = rows[0];
    const keys = Object.keys(sample).filter((key) => !['id', '_id', 'createdAt', 'updatedAt'].includes(key));
    const selected = keys.slice(0, 7);

    if (sample[idField] === undefined) {
      return selected;
    }

    return [idField, ...selected];
  }, [rows, idField]);

  const previewKeys = useMemo(() => displayKeys.filter((key) => key !== idField).slice(0, 4), [displayKeys, idField]);

  const modalWidth = isCompact ? 'calc(100vw - 24px)' : 900;

  const openEditModal = (record: Record<string, unknown>) => {
    const editableKeys = getEditableKeys(record, idField);
    const initialValues: Record<string, unknown> = {};
    const kinds: Record<string, EditorKind> = {};

    editableKeys.forEach((key) => {
      const kind = inferFieldKind(key, record[key]);
      kinds[key] = kind;
      initialValues[key] = toFormValue(record[key], kind);
    });

    editForm.setFieldsValue(initialValues);
    setEditingFieldKinds(kinds);
    setEditingRow(record);
  };

  const columns = useMemo<ColumnsType<Record<string, unknown>>>(() => {
    const generated: ColumnsType<Record<string, unknown>> = displayKeys.map((key) => ({
      title: key,
      dataIndex: key,
      key,
      ellipsis: true,
      render: (value: unknown) => {
        if (isBooleanLike(value)) {
          return <Tag color={value ? 'green' : 'volcano'}>{value ? 'true' : 'false'}</Tag>;
        }
        return <Typography.Text>{prettyValue(value)}</Typography.Text>;
      },
    }));

    generated.push({
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 110,
      render: (_value: unknown, record: Record<string, unknown>) => <Button type="link" onClick={() => openEditModal(record)}>Edit</Button>,
    });

    return generated;
  }, [displayKeys]);

  const handleSaveEdit = async () => {
    if (!editingRow) return;
    const idValue = editingRow[idField] ?? editingRow.id ?? editingRow.code;
    if (!idValue) {
      messageApi.error(`Unable to resolve ${idField} for this record`);
      return;
    }

    const editableKeys = getEditableKeys(editingRow, idField);

    let parsed: Record<string, unknown>;

    try {
      const values = await editForm.validateFields();
      const patch: Record<string, unknown> = {};

      editableKeys.forEach((key) => {
        const kind = editingFieldKinds[key] ?? inferFieldKind(key, editingRow[key]);
        if (kind === 'json') {
          return;
        }

        const nextValue = fromFormValue(values[key], editingRow[key], kind);
        if (!valuesEqual(nextValue, editingRow[key])) {
          patch[key] = nextValue;
        }
      });

      parsed = patch;
    } catch {
      messageApi.error('Please review invalid field values and try again');
      return;
    }

    if (Object.keys(parsed).length === 0) {
      messageApi.info('No editable changes to save');
      return;
    }

    setSavingEdit(true);
    try {
      await updateData(String(idValue), parsed);
      messageApi.success('Record updated successfully');
      setEditingRow(null);
      setEditingFieldKinds({});
      editForm.resetFields();
      await loadRows();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreate = async () => {
    if (!createData) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(createPayload);
    } catch {
      messageApi.error('New record JSON is invalid');
      return;
    }

    setSavingCreate(true);
    try {
      await createData(parsed);
      messageApi.success('Record created successfully');
      setCreating(false);
      setCreatePayload('{}');
      await loadRows();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Create failed');
    } finally {
      setSavingCreate(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Card className="resource-card" bordered={false}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Typography.Title level={3} className="page-title">
            {title}
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="page-subtitle">
            {subtitle}
          </Typography.Paragraph>

          <div className="resource-toolbar">
            <Space className="resource-search-actions" wrap>
              <Input.Search
                allowClear
                placeholder="Search records"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onSearch={() => {
                  setPage(1);
                  loadRows();
                }}
                className="resource-search"
              />
              <Button
                onClick={() => {
                  setPage(1);
                  loadRows();
                }}
              >
                Refresh
              </Button>
            </Space>

            {createData ? (
              <Button type="primary" onClick={() => setCreating(true)} className="resource-create-button">
                Create New
              </Button>
            ) : null}
          </div>

          {isCompact ? (
            <div className="resource-mobile-layout">
              <List
                loading={loading}
                dataSource={rows}
                locale={{ emptyText: 'No records found' }}
                renderItem={(record) => {
                  const recordLabel = prettyValue(record[idField] ?? record.id ?? record.code ?? 'Record');

                  return (
                    <List.Item>
                      <Card
                        className="resource-mobile-card"
                        title={<Typography.Text strong>{recordLabel}</Typography.Text>}
                        extra={<Button type="link" onClick={() => openEditModal(record)}>Edit</Button>}
                      >
                        <Descriptions column={1} size="small" colon={false}>
                          {previewKeys.map((key) => (
                            <Descriptions.Item key={key} label={key}>
                              {isBooleanLike(record[key]) ? (
                                <Tag color={record[key] ? 'green' : 'volcano'}>{record[key] ? 'true' : 'false'}</Tag>
                              ) : (
                                <Typography.Text>{prettyValue(record[key])}</Typography.Text>
                              )}
                            </Descriptions.Item>
                          ))}
                        </Descriptions>
                      </Card>
                    </List.Item>
                  );
                }}
              />

              <Pagination
                className="resource-pagination"
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                size="small"
                align="center"
                onChange={(nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize || 25);
                }}
              />
            </div>
          ) : (
            <Table
              rowKey={(record) => String(record[idField] ?? record.id ?? record.code ?? Math.random())}
              loading={loading}
              columns={columns}
              dataSource={rows}
              scroll={{ x: true }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize || 25);
                },
              }}
            />
          )}
        </Space>
      </Card>

      <Modal
        title={`Edit ${title}`}
        open={!!editingRow}
        onCancel={() => {
          setEditingRow(null);
          setEditingFieldKinds({});
          editForm.resetFields();
        }}
        onOk={handleSaveEdit}
        okText="Save Changes"
        confirmLoading={savingEdit}
        width={modalWidth}
        style={{ top: isCompact ? 12 : 32 }}
      >
        {editingRow ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Field type is shown next to each label so non-technical users can edit safely.
            </Typography.Paragraph>

            <Form form={editForm} layout="vertical">
              {getEditableKeys(editingRow, idField).map((key) => {
                const originalValue = editingRow[key];
                const kind = editingFieldKinds[key] ?? inferFieldKind(key, originalValue);
                const label = (
                  <Space size={6}>
                    <span>{key}</span>
                    <Typography.Text type="secondary">({getKindLabel(kind)})</Typography.Text>
                  </Space>
                );

                if (kind === 'boolean') {
                  return (
                    <Form.Item key={key} label={label} name={key} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  );
                }

                if (kind === 'number') {
                  return (
                    <Form.Item key={key} label={label} name={key}>
                      <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                  );
                }

                if (kind === 'date') {
                  return (
                    <Form.Item key={key} label={label} name={key}>
                      <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>
                  );
                }

                if (kind === 'datetime') {
                  return (
                    <Form.Item key={key} label={label} name={key}>
                      <DatePicker style={{ width: '100%' }} showTime format="YYYY-MM-DD HH:mm:ss" />
                    </Form.Item>
                  );
                }

                if (kind === 'time') {
                  return (
                    <Form.Item key={key} label={label} name={key}>
                      <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
                    </Form.Item>
                  );
                }

                if (kind === 'json') {
                  return (
                    <Form.Item
                      key={key}
                      label={label}
                      name={key}
                      extra="Complex field. Standard editor keeps this read-only to avoid accidental structure breaks."
                    >
                      <Input.TextArea rows={4} disabled />
                    </Form.Item>
                  );
                }

                const isLongText = typeof originalValue === 'string' && originalValue.length > 100;

                return (
                  <Form.Item key={key} label={label} name={key}>
                    {isLongText ? <Input.TextArea rows={4} /> : <Input />}
                  </Form.Item>
                );
              })}
            </Form>
          </Space>
        ) : null}
      </Modal>

      <Modal
        title={`Create ${title} record`}
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={handleCreate}
        okText="Create"
        confirmLoading={savingCreate}
        width={modalWidth}
        style={{ top: isCompact ? 12 : 32 }}
      >
        <Typography.Paragraph type="secondary">
          Provide a JSON document with required fields for this entity.
        </Typography.Paragraph>
        <Input.TextArea rows={isCompact ? 12 : 16} value={createPayload} onChange={(event) => setCreatePayload(event.target.value)} />
      </Modal>
    </>
  );
}

export { ResourceTablePage };