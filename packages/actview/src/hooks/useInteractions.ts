import type {ElementProps, ExtendedUserProps} from '../types';
import {ACTIVE_KEY, FOCUSABLE_ATTRIBUTE, SELECTED_KEY} from '../utils/constants';

/**
 * actview 版（upstream 为 React hook：useCallback/useMemo 缓存 getters）。
 *
 * 与 upstream 的差异：
 * - 无 useCallback/useMemo：getters 每次调用新建（actview setup 中调用一次，
 *   propsList 由调用方在 setup 中固定传入）
 * - `React.HTMLProps` → 宽松 `Record<string, unknown>`（ElementProps 同）
 */

function mergeProps<Key extends keyof ElementProps>(
  userProps: (Record<string, unknown> & ExtendedUserProps) | undefined,
  propsList: Array<ElementProps | void>,
  elementKey: Key,
): Record<string, unknown> {
  const map = new Map<string, Array<(...args: any[]) => void>>();
  const isItem = elementKey === 'item';

  let domUserProps = userProps;
  if (isItem && userProps) {
    const {[ACTIVE_KEY]: _, [SELECTED_KEY]: __, ...validProps} = userProps;
    domUserProps = validProps;
  }

  return {
    ...(elementKey === 'floating' && {
      tabIndex: -1,
      [FOCUSABLE_ATTRIBUTE]: '',
    }),
    ...domUserProps,
    ...propsList
      .map((value) => {
        const propsOrGetProps = value ? value[elementKey] : null;
        if (typeof propsOrGetProps === 'function') {
          return userProps ? propsOrGetProps(userProps) : null;
        }
        return propsOrGetProps;
      })
      .concat(userProps)
      .reduce((acc: Record<string, unknown>, props) => {
        if (!props) {
          return acc;
        }

        Object.entries(props).forEach(([key, value]) => {
          if (isItem && [ACTIVE_KEY, SELECTED_KEY].includes(key)) {
            return;
          }

          if (key.indexOf('on') === 0) {
            if (!map.has(key)) {
              map.set(key, []);
            }

            if (typeof value === 'function') {
              map.get(key)?.push(value);

              acc[key] = (...args: any[]) => {
                return map
                  .get(key)
                  ?.map((fn) => fn(...args))
                  .find((val) => val !== undefined);
              };
            }
          } else {
            acc[key] = value;
          }
        });

        return acc;
      }, {}),
  };
}

export interface UseInteractionsReturn {
  getReferenceProps: (userProps?: Record<string, unknown>) => Record<string, unknown>;
  getFloatingProps: (userProps?: Record<string, unknown>) => Record<string, unknown>;
  getItemProps: (
    userProps?: Omit<Record<string, unknown>, 'selected' | 'active'> &
      ExtendedUserProps,
  ) => Record<string, unknown>;
}

/**
 * Merges an array of interaction hooks' props into prop getters, allowing
 * event handler functions to be composed together without overwriting one
 * another.
 * @see https://floating-ui.com/docs/useInteractions
 */
export function useInteractions(
  propsList: Array<ElementProps | void> = [],
): UseInteractionsReturn {
  const getReferenceProps = (userProps?: Record<string, unknown>) =>
    mergeProps(userProps, propsList, 'reference');

  const getFloatingProps = (userProps?: Record<string, unknown>) =>
    mergeProps(userProps, propsList, 'floating');

  const getItemProps = (
    userProps?: Omit<Record<string, unknown>, 'selected' | 'active'> &
      ExtendedUserProps,
  ) => mergeProps(userProps, propsList, 'item');

  return {getReferenceProps, getFloatingProps, getItemProps};
}
