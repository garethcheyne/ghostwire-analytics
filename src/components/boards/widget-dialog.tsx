'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useDefinitions } from '@/hooks/queries/definitions';
import {
  CATEGORIES,
  COMPONENTS,
  type ConfigField,
  getComponentDefinition,
  getComponentsForEntity,
  getFieldOptions,
} from '@/lib/board-components';
import type { BoardEntityType } from '@/lib/boards';
import type { BoardComponentConfig } from '@/lib/types';
import { type BoardEntity, useBoardEntities } from './board-entities';

const ENTITY_GROUPS: { type: BoardEntityType; label: string }[] = [
  { type: 'website', label: 'Websites' },
  { type: 'link', label: 'Links' },
  { type: 'pixel', label: 'Pixels' },
];

function ReportSelect({
  field,
  entityId,
  value,
  onChange,
}: {
  field: ConfigField;
  entityId?: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  const { data } = useDefinitions(entityId ?? '', field.reportType ?? 'goals');

  return (
    <Select value={value ?? ''} onValueChange={onChange} disabled={!entityId}>
      <SelectTrigger className="w-full">
        <SelectValue
          placeholder={
            entityId ? `Choose a ${field.label.toLowerCase()}` : 'Choose a website first'
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {data?.data.map(report => (
            <SelectItem key={report.id} value={report.id}>
              {report.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Add or edit one board widget: what it is, what it shows, and its settings. */
export function WidgetDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BoardComponentConfig;
  onSave: (config: BoardComponentConfig) => void;
}) {
  const { data: entities } = useBoardEntities();
  const [type, setType] = useState(initial?.type ?? 'WebsiteMetricsBar');
  const [entityId, setEntityId] = useState(initial?.entityId ?? initial?.websiteId ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [props, setProps] = useState<Record<string, string>>(initial?.props ?? {});

  const entity: BoardEntity | undefined = entities?.find(item => item.id === entityId);
  const definition = getComponentDefinition(type);
  const available = entity ? getComponentsForEntity(entity.type) : COMPONENTS;
  const missingEntity = definition?.needsEntity && !entity;
  const missingRequired = definition?.configFields?.some(
    field => field.required && !(props[field.name] ?? field.defaultValue),
  );

  function save() {
    if (!definition) return;

    const resolvedProps = Object.fromEntries(
      (definition.configFields ?? []).map(field => [
        field.name,
        props[field.name] ?? field.defaultValue ?? '',
      ]),
    );

    onSave({
      type,
      ...(definition.needsEntity &&
        entity && {
          entityType: entity.type,
          entityId: entity.id,
          ...(entity.type === 'website' && { websiteId: entity.id }),
        }),
      ...(title.trim() && { title: title.trim() }),
      props: resolvedProps,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit widget' : 'Add widget'}</DialogTitle>
          <DialogDescription>{definition?.description}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Widget</FieldLabel>
            <Select
              value={type}
              onValueChange={value => {
                setType(value);
                setProps({});
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(category => {
                  const items = available.filter(item => item.category === category.key);
                  if (!items.length) return null;

                  return (
                    <SelectGroup key={category.key}>
                      <SelectLabel>{category.name}</SelectLabel>
                      {items.map(item => (
                        <SelectItem key={item.type} value={item.type}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>

          {definition?.needsEntity && (
            <Field>
              <FieldLabel>Shows</FieldLabel>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a website, link or pixel" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_GROUPS.map(group => {
                    const items = (entities ?? []).filter(item => item.type === group.type);
                    if (!items.length) return null;

                    return (
                      <SelectGroup key={group.type}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {items.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          )}

          {definition?.configFields?.map(field => (
            <Field key={field.name}>
              <FieldLabel htmlFor={`widget-${field.name}`}>{field.label}</FieldLabel>
              {field.type === 'select' ? (
                <Select
                  value={props[field.name] ?? field.defaultValue ?? ''}
                  onValueChange={value =>
                    setProps(current => ({ ...current, [field.name]: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {getFieldOptions(field, entity?.type).map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : field.type === 'report' ? (
                <ReportSelect
                  field={field}
                  entityId={entity?.type === 'website' ? entity.id : undefined}
                  value={props[field.name]}
                  onChange={value => setProps(current => ({ ...current, [field.name]: value }))}
                />
              ) : field.type === 'textarea' ? (
                <Textarea
                  id={`widget-${field.name}`}
                  rows={4}
                  value={props[field.name] ?? ''}
                  onChange={event =>
                    setProps(current => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              ) : (
                <Input
                  id={`widget-${field.name}`}
                  value={props[field.name] ?? ''}
                  onChange={event =>
                    setProps(current => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              )}
            </Field>
          ))}

          <Field>
            <FieldLabel htmlFor="widget-title">Title</FieldLabel>
            <Input
              id="widget-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={100}
              placeholder={type === 'TextBlock' ? 'Heading (optional)' : 'Optional'}
            />
            {definition?.needsEntity && (
              <FieldDescription>
                Leave blank to use the website, link or pixel name.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!definition || missingEntity || missingRequired}>
            {initial ? 'Save widget' : 'Add widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
