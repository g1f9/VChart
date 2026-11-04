import { EventEmitter } from '@visactor/vutils';
import { Compiler } from '../../../src/compile/compiler';
import type { VChart } from '../../../src/core/vchart';
import { Event } from '../../../src/event/event';
import { EventDispatcher } from '../../../src/event/event-dispatcher';
import { DimensionHoverEvent } from '../../../src/event/events/dimension/dimension-hover';
import type { IDimensionInfo } from '../../../src/event/events/dimension/interface';
import type { BaseEventParams } from '../../../src/event/interface';

describe('[event] DimensionHoverEvent', () => {
  test('scoped pointercancel reaches public listeners and clears hover without pointerout', () => {
    const canvas = new EventEmitter();
    const compiler = new Compiler(null, { eventSource: { canvas, window: new EventEmitter() } });
    const dimensionInfo: IDimensionInfo[] = [{ value: 'A', data: [] }];
    const chart = { getOption: () => ({}), getModelOption: () => ({ getDimensionInfo: () => dimensionInfo }) };
    const dispatcher = new EventDispatcher({ getChart: () => chart } as unknown as VChart, compiler);
    const event = new Event(dispatcher, 'desktop-browser');
    const hover = new DimensionHoverEvent(dispatcher, 'desktop-browser');
    const onCancel = jest.fn();
    const onHover = jest.fn();
    const move = { source: 'chart', event: { viewX: 10, viewY: 20 } } as unknown as BaseEventParams;
    const cancel = { type: 'pointercancel', pointerId: 1 };

    event.on('pointercancel', { source: 'canvas' }, onCancel);
    hover.register('dimensionHover', { callback: onHover, query: null });
    dispatcher.dispatch('pointermove', move);
    expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'enter', dimensionInfo }));

    canvas.emit('pointercancel', cancel);
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ source: 'canvas', event: cancel }));
    expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'leave', dimensionInfo }));

    canvas.emit('pointercancel', cancel);
    canvas.emit('pointerout', { type: 'pointerout' });
    expect(onHover).toHaveBeenCalledTimes(2);

    dispatcher.dispatch('pointermove', move);
    expect(onHover).toHaveBeenCalledTimes(3);
    expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'enter', dimensionInfo }));

    event.off('pointercancel', onCancel);
    canvas.emit('pointercancel', cancel);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'leave', dimensionInfo }));
    dispatcher.release();
    expect(canvas.listenerCount('pointercancel')).toBe(0);
  });

  test('unregisters every desktop event it registers', () => {
    const eventDispatcher = {
      register: jest.fn(),
      unregister: jest.fn()
    };
    const event = new DimensionHoverEvent(eventDispatcher as any, 'desktop-browser');

    event.register('dimensionHover', { callback: jest.fn(), query: {} } as any);
    event.unregister();

    expect(eventDispatcher.unregister).toHaveBeenCalledWith('pointermove', {
      query: null,
      callback: expect.any(Function)
    });
    expect(eventDispatcher.unregister).toHaveBeenCalledWith('pointerout', {
      query: null,
      callback: expect.any(Function)
    });
  });
});
