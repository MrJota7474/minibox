type Child = Node | string | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Readonly<Record<string, string>>;
  onClick?: (e: Event) => void;
}

/** Pequeño ayudante para crear elementos del DOM. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}, children: readonly Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) {
    node.title = props.title;
    node.setAttribute('aria-label', props.title);
  }
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  if (props.onClick) node.addEventListener('click', props.onClick);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c);
  }
  return node;
}

/** Botón con icono pixelado y etiqueta opcional. */
export function iconButton(icon: string, label: string, opts: { class?: string; showLabel?: boolean; onClick: () => void }): HTMLButtonElement {
  const img = el('img', { attrs: { src: icon, alt: '', draggable: 'false' } });
  const btn = el('button', { class: `btn ${opts.class ?? ''}`.trim(), title: label, attrs: { type: 'button' }, onClick: () => opts.onClick() }, [
    img,
    opts.showLabel ? el('span', { class: 'btn-label', text: label }) : null,
  ]);
  return btn;
}

export function setPressed(btn: HTMLElement, pressed: boolean): void {
  btn.classList.toggle('is-active', pressed);
  btn.setAttribute('aria-pressed', String(pressed));
}
