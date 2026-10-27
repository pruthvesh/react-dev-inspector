'use client'

import {
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import type { Fiber } from 'react-reconciler'
import {
  InspectContextPanel,
  type ElementItemInfo,
  type InspectContextPanelShowParams,
} from '@react-dev-inspector/web-components'
import {
  type TrustedEditor,
} from '@react-dev-inspector/launch-editor-endpoint'
import {
  gotoServerEditor,
} from './utils'
import {
  elementsChainGenerator,
} from './services'
import {
  useHotkeyToggle,
  useEffectEvent,
  useRecordPointer,
  useControlledActive,
} from './hooks'
import {
  type DOMElement,
  domInspectAgent,
} from './DOMInspectAgent'
import type {
  CodeInfo,
  InspectAgent,
} from './types'


const defaultInspectAgents: InspectAgent<any>[] = [
  domInspectAgent,
]

/**
 * the inspect meta info that is sent to the callback when an element is hovered over or clicked.
 */
export interface InspectParams<Element = DOMElement> {
  /** hover / click event target dom element */
  element: Element;
  /** nearest named react component fiber for dom element */
  fiber?: Fiber;
  /** source file line / column / path info for react component */
  codeInfo?: CodeInfo;
  /** react component name for dom element */
  name?: string;
  /**
   * user chosen prefer editor
   *
   * > add in version `v2.1.0`
   */
  editor?: TrustedEditor;
}

export type OnInspectElementParams<Element = DOMElement> =
  & Omit<Required<InspectParams<Element>>, 'editor'>
  & Pick<InspectParams<Element>, 'editor'>

export interface InspectorProps<
  InspectAgents extends InspectAgent<any>[],
  Element extends ElementInInspectAgents<InspectAgents> = ElementInInspectAgents<InspectAgents>,
> {
  /**
   * Inspector Component toggle hotkeys,
   *
   * supported keys see: https://github.com/jaywcjlove/hotkeys#supported-keys
   *
   * @default - `['Ctrl', 'Shift', 'Command', 'C']` on macOS, `['Ctrl', 'Shift', 'Alt', 'C']` on other platforms.
   *
   * Setting `keys={null}` explicitly means that disable use hotkeys to trigger it.
   */
  keys?: string[] | null;

  /**
   * If setting `active` prop, the Inspector will be a Controlled React Component,
   *   you need to control the `true`/`false` state to active the Inspector.
   *
   * If not setting `active` prop, this only a Uncontrolled component that
   *   will activate/deactivate by hotkeys.
   *
   * > add in version `v2.0.0`
   */
  active?: boolean;

  /**
   * Trigger by `active` state change, includes:
   * - hotkeys toggle, before activate/deactivate Inspector
   * - Escape / Click, before deactivate Inspector
   *
   * will NOT trigger by `active` prop change.
   *
   * > add in version `v2.0.0`
   */
  onActiveChange?: (active: boolean) => void;

  /**
   * Whether to disable all behavior include hotkeys listening or trigger,
   * will automatically disable in production environment by default.
   *
   * @default `true` if `NODE_ENV` is 'production', otherwise is `false`.
   *
   * > add in version `v2.0.0`
   */
  disable?: boolean;

  /**
   * Agent for get inspection info in different React renderer with user interaction
   *
   * Default: {@link domInspectAgent}
   *
   * > add in version `v2.1.0`
   */
  inspectAgents?: InspectAgents;

  /**
   * Callback when left-clicking on an element, with ensuring the source code info is found.
   *
   * By setting the `onInspectElement` prop, the default behavior ("open local IDE") will be disabled,
   *   that means you want to manually handle the source info, or handle how to goto editor by yourself.
   *
   * You can also use builtin `gotoServerEditor` utils in `onInspectElement` to get origin behavior ("open local IDE on server-side"),
   *   it looks like:
   *
   * ```tsx
   * import { Inspector, gotoServerEditor } from 'react-dev-inspector'
   *
   * <Inspector
   *   onInspectElement={({ codeInfo }) => {
   *     ...; // your processing
   *     gotoServerEditor(codeInfo)
   *   }}
   * </Inspector>
   * ```
   *
   * > add in version `v2.0.0`
   */
  onInspectElement?: (params: OnInspectElementParams<Element>) => void;

  /** Callback when hovering on an element */
  onHoverElement?: (params: InspectParams<Element>) => void;

  /**
   * Callback when left-clicking on an element.
   */
  onClickElement?: (params: InspectParams<Element>) => void;

  ContextPanel?: typeof InspectContextPanel;

  /** any children of react nodes */
  children?: ReactNode;

  /**
   * Whether to disable default behavior: "launch to local IDE when click on component".
   *
   * @default `true` if setting `onInspectElement` callback, otherwise is `false`.
   * @deprecated please use `onInspectElement` callback instead for fully custom controlling.
   *
   * > deprecated in version `v2.0.0`
   */
  disableLaunchEditor?: boolean;
}

export const Inspector = function<
  InspectAgents extends InspectAgent<any>[] = InspectAgent<DOMElement>[],
>(props: InspectorProps<InspectAgents>) {
  type Element = ElementInInspectAgents<InspectAgents>

  const {
    keys,
    onHoverElement,
    onClickElement,
    onInspectElement,
    active: controlledActive,
    onActiveChange,
    inspectAgents = defaultInspectAgents,
    disableLaunchEditor,
    disable = (process.env.NODE_ENV !== 'development'),
    ContextPanel = InspectContextPanel,
    children,
  } = props

  const pointerRef = useRecordPointer({ disable })
  const agentRef = useRef<InspectAgent<Element> | undefined>(undefined)
  const contextPanelRef = useRef<InspectContextPanel<InspectElementItem<Element>> | undefined>(undefined)


  useEffect(() => {
    return () => {
      agentRef.current = undefined
      inspectAgents.forEach(agent => {
        agent.deactivate()
      })
    }
  }, [inspectAgents])

  const startInspecting = useEffectEvent(() => {
    inspectAgents.forEach(agent => {
      agent.activate({
        onHover: (params) => handleHoverElement({
          ...params,
          agent,
        }),
        onPointerDown: (params) => handlePointerDown({
          ...params,
          agent,
        }),
        onClick: (params) => handleClickElement({
          ...params,
          agent,
        }),
      })
    })

    window.addEventListener('contextmenu', onContextMenuEvent, { capture: true })

    if (!pointerRef.current) {
      return
    }

    Promise.all(inspectAgents.map(agent => agent.getTopElementFromPointer?.(pointerRef.current!)))
      .then(elements => {
        for (const [index, element] of elements.entries()) {
          if (element) {
            handleHoverElement({
              agent: inspectAgents[index],
              element,
              pointer: pointerRef.current!,
            })
            return
          }
        }
      })
  })

  const onContextMenuEvent = useEffectEvent(async (event: MouseEvent) => {
    if (contextPanelRef.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    inspectAgents.forEach(agent => {
      agent.deactivate()
    })

    agentRef.current?.removeIndicate()
    agentRef.current = undefined

    const layers = (await Promise.all(
      inspectAgents
        .filter(agent => agent.getTopElementsFromPointer)
        .map(async agent => {
          const elements = await agent.getTopElementsFromPointer!(event)
          return elements.map(element => ({
            agent,
            element,
          }))
        }),
    )).flat()

    const renderLayers = layers.map(({ agent, element }) => (() => elementsChainGenerator({
      agent,
      agents: inspectAgents,
      element,
      generateElement: (agent, element) => agent.getRenderChain(element),
    })))

    const sourceLayers = layers.map(({ agent, element }) => (() => elementsChainGenerator({
      agent,
      agents: inspectAgents,
      element,
      generateElement: (agent, element) => agent.getSourceChain(element),
    })))


    const onHoverToIndicate = (item: InspectElementItem<Element> | null) => {
      if (!item?.element) {
        agentRef.current?.removeIndicate()
        agentRef.current = undefined
        return
      }

      handleHoverElement({
        agent: item.agent,
        element: item.element,
        nameInfo: {
          name: item.title,
          title: item.title,
        },
        codeInfo: item.codeInfo,
      })
    }

    const onClickToEditor = ({ item, editor }: {
      item: InspectElementItem<Element>;
      editor?: TrustedEditor;
    }) => {
      if (!item?.element) {
        return
      }
      if (agentRef.current !== item.agent) {
        agentRef.current?.removeIndicate()
        agentRef.current = item.agent
      }
      handleClickElement({
        agent: item.agent,
        element: item.element,
        codeInfo: item.codeInfo,
        nameInfo: {
          name: item.title,
          title: item.title,
        },
        editor,
      })
    }

    contextPanelRef.current = new ContextPanel()
    contextPanelRef.current.show({
      initialPosition: {
        x: event.clientX,
        y: event.clientY,
      },
      sizeLimit: contextPanelSizeLimit,
      onClickOutside: deactivate,
      panelParams: {
        renderLayers,
        sourceLayers,
        onHoverItem: onHoverToIndicate,
        onClickItem: (item) => {
          onClickToEditor({ item })
        },
        onClickEditor: onClickToEditor,
      },
    })
  })

  const stopInspecting = useEffectEvent(() => {
    agentRef.current?.removeIndicate()
    inspectAgents.forEach(agent => {
      agent.deactivate()
    })
    agentRef.current = undefined

    contextPanelRef.current?.hide()
    contextPanelRef.current?.remove()
    contextPanelRef.current = undefined
    window.removeEventListener('contextmenu', onContextMenuEvent, { capture: true })
  })

  const handleHoverElement = useEffectEvent(({
    agent,
    element,
    nameInfo,
    codeInfo,
    pointer,
  }: {
    agent: InspectAgent<Element>;
    element: Element;
    pointer?: PointerEvent;
    nameInfo?: {
      /** element's constructor name */
      name: string;
      /** display to describe the element as short */
      title: string;
    };
    codeInfo?: CodeInfo;
  }) => {
    if (agent !== agentRef.current) {
      agentRef.current?.removeIndicate()
      agentRef.current = agent
    }

    nameInfo ??= agent.getNameInfo(element)
    agent.indicate({
      element,
      codeInfo,
      pointer,
      name: nameInfo?.name,
      title: nameInfo?.title,
    })

    if (!onHoverElement) {
      return
    }

    codeInfo ??= agent.findCodeInfo(element)
    const fiber = agent.findElementFiber?.(element)

    onHoverElement({
      element,
      fiber,
      codeInfo,
      name: nameInfo?.name ?? nameInfo?.title ?? '',
    })
  })

  const handlePointerDown = useEffectEvent(({ agent, element, pointer }: {
    agent: InspectAgent<Element>;
    element?: Element;
    pointer: PointerEvent;
  }) => {
    if (agent !== agentRef.current) {
      return
    }

    // only need stop event when it trigger by current agent
    pointer.preventDefault()
    pointer.stopPropagation()
    pointer.stopImmediatePropagation()

    if (element) {
      handleHoverElement({
        agent,
        element,
        pointer,
      })
    }
  })

  const handleClickElement = useEffectEvent(({
    agent,
    element,
    pointer,
    nameInfo,
    codeInfo,
    editor,
  }: {
    agent: InspectAgent<Element>;
    element?: Element;
    pointer?: PointerEvent;
    nameInfo?: {
      /** element's constructor name */
      name: string;
      /** display to describe the element as short */
      title: string;
    };
    codeInfo?: CodeInfo;
    editor?: TrustedEditor;
  }) => {
    if (agent !== agentRef.current) {
      return
    }

    // only need stop event when it trigger by current agent
    pointer?.preventDefault()
    pointer?.stopPropagation()
    pointer?.stopImmediatePropagation()

    agent.removeIndicate()

    if (!element) {
      return
    }

    nameInfo ??= agent.getNameInfo(element)
    codeInfo ??= agent.findCodeInfo(element)
    const fiber = agent.findElementFiber?.(element)

    deactivate()

    onClickElement?.({
      element,
      fiber,
      codeInfo,
      name: nameInfo?.name,
      editor,
    })

    if (fiber && codeInfo) {
      onInspectElement?.({
        element,
        fiber,
        codeInfo,
        name: nameInfo?.name ?? nameInfo?.title ?? '',
        editor,
      })
    }

    if (codeInfo && !onInspectElement && !disableLaunchEditor) {
      gotoServerEditor(codeInfo, { editor })
    }
  })

  const { activate, deactivate, activeRef } = useControlledActive({
    controlledActive,
    onActiveChange,
    onActivate: startInspecting,
    onDeactivate: stopInspecting,
    disable,
  })

  useHotkeyToggle({
    keys,
    disable,
    activeRef,
    deactivate,
    activate,
  })

  return (<>{children ?? null}</>)
}

interface InspectElementItem<Element = any> extends ElementItemInfo {
  agent: InspectAgent<Element>;
  element?: Element | null;
}

type ElementInInspectAgents<Agents> = Agents extends (infer Agent)[]
  ? Agent extends InspectAgent<infer Element>
    ? Element
    : unknown
  : unknown

const contextPanelSizeLimit: InspectContextPanelShowParams['sizeLimit'] = {
  minWidth: 160,
  minHeight: 160,
  maxWidth: 800,
  maxHeight: 800,
}
