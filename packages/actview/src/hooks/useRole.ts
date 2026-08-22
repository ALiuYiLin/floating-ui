import {computed} from '@actview/core';
import {getFloatingFocusElement} from '@floating-ui/actview/utils';

import {useFloatingParentNodeId} from '../components/FloatingTree';
import type {
  ElementProps,
  ExtendedUserProps,
  FloatingRootContext,
} from '../types';
import {useId} from './useId';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - reference / floating 为 `computed`（响应式派生：open / floatingId / referenceId
 *   变化时重建），mergeProps 用 `unref` 解包
 * - item 为普通函数（闭包读 `floatingId.value`，每次调用取最新值）
 * - `useId` 返回 `Ref<string | undefined>`（.value）
 * - props 标量（enabled / role）在 setup 解构固定
 */

type AriaRole =
  | 'tooltip'
  | 'dialog'
  | 'alertdialog'
  | 'menu'
  | 'listbox'
  | 'grid'
  | 'tree';
type ComponentRole = 'select' | 'label' | 'combobox';

export interface UseRoleProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * The role of the floating element.
   * @default 'dialog'
   */
  role?: AriaRole | ComponentRole | undefined;
}

const componentRoleToAriaRoleMap = new Map<
  AriaRole | ComponentRole,
  AriaRole | false
>([
  ['select', 'listbox'],
  ['combobox', 'listbox'],
  ['label', false],
]);

/**
 * Adds base screen reader props to the reference and floating elements for a
 * given floating element `role`.
 * @see https://floating-ui.com/docs/useRole
 */
export function useRole(
  context: FloatingRootContext,
  props: UseRoleProps = {},
): ElementProps {
  const {open, elements, floatingId: defaultFloatingId} = context;
  const {enabled = true, role = 'dialog'} = props;

  const defaultReferenceId = useId();
  const referenceId = computed(
    () => elements.domReference.value?.id || defaultReferenceId.value,
  );
  const floatingId = computed(
    () =>
      getFloatingFocusElement(elements.floating.value)?.id ||
      defaultFloatingId.value,
  );

  const ariaRole = (componentRoleToAriaRoleMap.get(role) ?? role) as
    | AriaRole
    | false
    | undefined;

  const parentId = useFloatingParentNodeId();
  const isNested = parentId != null;

  const reference: ElementProps['reference'] = computed(() => {
    if (ariaRole === 'tooltip' || role === 'label') {
      return {
        [`aria-${role === 'label' ? 'labelledby' : 'describedby'}`]: open.value
          ? floatingId.value
          : undefined,
      };
    }

    return {
      'aria-expanded': open.value ? 'true' : 'false',
      'aria-haspopup': ariaRole === 'alertdialog' ? 'dialog' : ariaRole,
      'aria-controls': open.value ? floatingId.value : undefined,
      ...(ariaRole === 'listbox' && {role: 'combobox'}),
      ...(ariaRole === 'menu' && {id: referenceId.value}),
      ...(ariaRole === 'menu' && isNested && {role: 'menuitem'}),
      ...(role === 'select' && {'aria-autocomplete': 'none'}),
      ...(role === 'combobox' && {'aria-autocomplete': 'list'}),
    };
  });

  const floating: ElementProps['floating'] = computed(() => {
    const floatingProps = {
      id: floatingId.value,
      ...(ariaRole && {role: ariaRole}),
    };

    if (ariaRole === 'tooltip' || role === 'label') {
      return floatingProps;
    }

    return {
      ...floatingProps,
      ...(ariaRole === 'menu' && {'aria-labelledby': referenceId.value}),
    };
  });

  const item: ElementProps['item'] = ({
    active,
    selected,
  }: ExtendedUserProps) => {
    const commonProps = {
      role: 'option',
      ...(active && {id: `${floatingId.value}-fui-option`}),
    };

    // For `menu`, we are unable to tell if the item is a `menuitemradio`
    // or `menuitemcheckbox`. For backwards-compatibility reasons, also
    // avoid defaulting to `menuitem` as it may overwrite custom role props.
    switch (role) {
      case 'select':
      case 'combobox':
        return {
          ...commonProps,
          'aria-selected': selected,
        };
    }

    return {};
  };

  return enabled ? {reference, floating, item} : {};
}
