import { EventEmitter } from '@visactor/vutils';
import { EventManager, FederatedPointerEvent, FederatedWheelEvent, type IStage } from '@visactor/vrender-core';
import { Compiler } from '../../../src/compile/compiler';
import type { VChart } from '../../../src/core/vchart';
import { Event } from '../../../src/event/event';
import { EventDispatcher } from '../../../src/event/event-dispatcher';

const setup = () => {
  const canvas = new EventEmitter();
  const windowSource = new EventEmitter();
  const chart = new EventEmitter();
  const manager = new EventManager(null, {});
  const compiler = new Compiler(null, { eventSource: { canvas, window: windowSource } });
  compiler['_stage'] = {
    eventSystem: { manager },
    addEventListener: chart.on.bind(chart),
    removeEventListener: chart.off.bind(chart)
  } as unknown as IStage;
  const dispatcher = new EventDispatcher({ getChart: (): null => null } as unknown as VChart, compiler);
  const event = new Event(dispatcher, 'desktop-browser');
  return { event, dispatcher, manager, sources: { canvas, window: windowSource, chart } };
};

describe('[event] delayed input', () => {
  test.each(['canvas', 'window', 'chart'] as const)('debounce preserves pooled pointer data from %s', async source => {
    const { event, dispatcher, sources } = setup();
    const input = new FederatedPointerEvent();
    input.type = 'pointerdown';
    input.pointerId = 1;
    input.buttons = 1;
    input.client.x = input.canvas.x = input.viewport.x = 200;
    const completed = new Promise(resolve => {
      event.on('pointerdown', { source, debounce: 20 }, params => resolve(params.event));
    });
    try {
      sources[source].emit('pointerdown', input);
      input.type = 'pointerup';
      input.buttons = 0;
      input.client.x = input.canvas.x = input.viewport.x = 350;
      const saved = await completed;
      expect(saved).toMatchObject({ type: 'pointerdown', clientX: 200, canvasX: 200, viewX: 200, buttons: 1 });
      expect(saved).not.toBe(input);
    } finally {
      event.release();
      dispatcher.release();
    }
  });

  test('throttle preserves the trailing pointer event', async () => {
    const { event, dispatcher, sources } = setup();
    const input = new FederatedPointerEvent();
    input.pointerId = 1;
    input.type = 'pointerdown';
    input.buttons = 1;
    input.canvas.x = 200;
    const calls: { type: string; x: number; buttons: number }[] = [];
    const completed = new Promise<void>(resolve => {
      event.on('pointerdown', { source: 'canvas', throttle: 20 }, params => {
        calls.push({ type: params.event.type, x: params.event.canvasX, buttons: params.event.buttons });
        if (calls.length === 2) {
          resolve();
        }
      });
    });
    try {
      sources.canvas.emit('pointerdown', input);
      input.canvas.x = 210;
      sources.canvas.emit('pointerdown', input);
      input.type = 'pointerup';
      input.buttons = 0;
      input.canvas.x = 350;
      await completed;
      expect(calls).toEqual([
        { type: 'pointerdown', x: 200, buttons: 1 },
        { type: 'pointerdown', x: 210, buttons: 1 }
      ]);
    } finally {
      event.release();
      dispatcher.release();
    }
  });

  test('debounce preserves wheel deltas and coordinates', async () => {
    const { event, dispatcher, sources } = setup();
    const input = new FederatedWheelEvent();
    input.type = 'wheel';
    input.deltaMode = 0;
    input.deltaX = 2;
    input.deltaY = 10;
    input.canvas.x = 200;
    const completed = new Promise(resolve => {
      event.on('wheel', { source: 'canvas', debounce: 20 }, params => resolve(params.event));
    });
    try {
      sources.canvas.emit('wheel', input);
      input.deltaX = 5;
      input.deltaY = 20;
      input.canvas.x = 350;
      expect(await completed).toMatchObject({ type: 'wheel', deltaMode: 0, deltaX: 2, deltaY: 10, canvasX: 200 });
    } finally {
      event.release();
      dispatcher.release();
    }
  });

  test('synchronous subscribers keep the original event', () => {
    const { event, dispatcher, sources, manager } = setup();
    const input = new FederatedPointerEvent();
    input.pointerId = 1;
    const copy = jest.spyOn(manager, 'copyMouseData');
    const received = jest.fn();
    event.on('pointerdown', { source: 'canvas' }, received);
    sources.canvas.emit('pointerdown', input);
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ event: input }));
    expect(received.mock.calls[0][0].event).toBe(input);
    expect(copy).not.toHaveBeenCalled();
    event.release();
    dispatcher.release();
  });

  test('delayed non-pooled events keep their identity', async () => {
    const { event, dispatcher, sources } = setup();
    const input = Object.freeze({ type: 'pointerdown', clientX: 200, buttons: 1 });
    const completed = new Promise(resolve => {
      event.on('pointerdown', { source: 'canvas', debounce: 20 }, params => resolve(params.event));
    });
    try {
      sources.canvas.emit('pointerdown', input);
      expect(await completed).toBe(input);
    } finally {
      event.release();
      dispatcher.release();
    }
  });

  test('delayed custom event parameters keep their shape', async () => {
    const { event, dispatcher } = setup();
    const input = { source: 'chart' as const, datum: { x: 1 } };
    const completed = new Promise(resolve => {
      event.on('custom', { debounce: 20 }, params => resolve(params));
    });
    try {
      event.emit('custom', input);
      expect(await completed).toStrictEqual(input);
    } finally {
      event.release();
      dispatcher.release();
    }
  });
});
