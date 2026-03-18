import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

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

function getEditableKeys(record: Record<string, unknown>, idField: string): string[] {
  return Object.keys(record).filter(
    (key) => !['_id', 'id', idField, 'createdAt', 'updatedAt', 'password', 'hashed_password'].includes(key)
  );
}

function toFormValue(value: unknown): unknown {
  if (isComplexValue(value)) {
    return JSON.stringify(value, null, 2);
  }
  return value;
}

function fromFormValue(inputValue: unknown, originalValue: unknown): unknown {
  if (isComplexValue(originalValue)) {
    const raw = String(inputValue ?? '').trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  }

  if (isNumberLike(originalValue)) {
    if (inputValue === '' || inputValue === null || inputValue === undefined) {
      return null;
    }
    return Number(inputValue);
  }

  if (isBooleanLike(originalValue)) {
    return Boolean(inputValue);
  }

  return inputValue;
}

export default function ResourceTablePage({ title, subtitle, idField, listData, updateData, createData }: ResourceTablePageProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [editForm] = Form.useForm();

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [editingPayload, setEditingPayload] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMode, setEditMode] = useState<'form' | 'json'>('form');

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

  const openEditModal = (record: Record<string, unknown>) => {
    const editableKeys = getEditableKeys(record, idField);
    const initialValues: Record<string, unknown> = {};

    editableKeys.forEach((key) => {
      initialValues[key] = toFormValue(record[key]);
    });

    editForm.setFieldsValue(initialValues);
    setEditingRow(record);
    setEditingPayload(JSON.stringify(record, null, 2));
    setEditMode('form');
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

    let parsed: Record<string, unknown>;
    const editableKeys = getEditableKeys(editingRow, idField);

    if (editMode === 'json') {
      try {
        parsed = JSON.parse(editingPayload);
      } catch {
        messageApi.error('Edited JSON is invalid');
        return;
      }
    } else {
      try {
        const values = await editForm.validateFields();
        const patch: Record<string, unknown> = {};

        editableKeys.forEach((key) => {
          patch[key] = fromFormValue(values[key], editingRow[key]);
        });

        parsed = patch;
      } catch (error) {
        if (error instanceof SyntaxError) {
          messageApi.error('One of the JSON fields is invalid');
        }
        return;
      }
    }

    setSavingEdit(true);
    try {
      await updateData(String(idValue), parsed);
      messageApi.success('Record updated successfully');
      setEditingRow(null);
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

          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
            <Space>
              <Input.Search
                allowClear
                placeholder="Search records"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onSearch={() => {
                  setPage(1);
                  loadRows();
                }}
                style={{ width: 280 }}
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
              <Button type="primary" onClick={() => setCreating(true)}>
                Create New
              </Button>
            ) : null}
          </Space>

          <Table
            rowKey={(record) => String(record[idField] ?? record.id ?? record.code ?? Math.random())}
            loading={loading}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 1200 }}
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
        </Space>
      </Card>

      <Modal
        title={`Edit ${title}`}
        open={!!editingRow}
        onCancel={() => {
          setEditingRow(null);
          editForm.resetFields();
        }}
        onOk={handleSaveEdit}
        okText="Save Changes"
        confirmLoading={savingEdit}
        width={900}
      >
        {editingRow ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Segmented
              options={[
                { label: 'Form Edit', value: 'form' },
                { label: 'Raw JSON', value: 'json' },
              ]}
              value={editMode}
              onChange={(value) => setEditMode(value as 'form' | 'json')}
            />

            {editMode === 'json' ? (
              <Input.TextArea rows={20} value={editingPayload} onChange={(event) => setEditingPayload(event.target.value)} />
            ) : (
              <Form form={editForm} layout="vertical">
                {getEditableKeys(editingRow, idField).map((key) => {
                  const originalValue = editingRow[key];

                  if (isBooleanLike(originalValue)) {
                    return (
                      <Form.Item key={key} label={key} name={key} valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    );
                  }

                  if (isNumberLike(originalValue)) {
                    return (
                      <Form.Item key={key} label={key} name={key}>
                        <InputNumber style={{ width: '100%' }} />
                      </Form.Item>
                    );
                  }

                  if (isComplexValue(originalValue)) {
                    return (
                      <Form.Item key={key} label={`${key} (JSON)`} name={key}>
                        <Input.TextArea rows={6} placeholder="Enter valid JSON" />
                      </Form.Item>
                    );
                  }

                  return (
                    <Form.Item key={key} label={key} name={key}>
                      <Input />
                    </Form.Item>
                  );
                })}
              </Form>
            )}
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
        width={900}
      >
        <Typography.Paragraph type="secondary">
          Provide a JSON document with required fields for this entity.
        </Typography.Paragraph>
        <Input.TextArea rows={16} value={createPayload} onChange={(event) => setCreatePayload(event.target.value)} />
      </Modal>
    </>
  );
}

export { ResourceTablePage };