import {defineComponent} from '@actview/core';

export const Button = defineComponent(function (props: any) {
  return () => (
    <button
      {...props}
      className={`${props.className ?? ''} bg-slate-200/90 rounded p-2 px-3 transition-colors hover:bg-slate-200/50 data-[open]:bg-slate-200/50`}
    />
  );
});
