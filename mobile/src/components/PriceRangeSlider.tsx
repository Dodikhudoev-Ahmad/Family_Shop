import { useRef, useState } from 'react';
import { PanResponder, Text, View, type AccessibilityActionEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { moveFrom, moveTo, positionOf, priceStep, valueAt } from '../lib/catalog/priceSlider';
import { formatPrice } from '../lib/mappers';
import { fontSizes, fonts, MIN_TOUCH_TARGET, spacing } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

const THUMB = 28;

const styles = (c: ColorTokens) => ({
  values: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: spacing.xs },
  value: { color: c.text, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm },
  area: { height: MIN_TOUCH_TARGET, justifyContent: 'center' as const, marginHorizontal: THUMB / 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: c.border },
  active: { position: 'absolute' as const, height: 4, borderRadius: 2, backgroundColor: c.accent },
  // The visible thumb is 28pt; the touch target around it is the full 44pt.
  hit: { position: 'absolute' as const, top: 0, width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center' as const, justifyContent: 'center' as const },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: c.bg, borderWidth: 2, borderColor: c.accent },
});

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

/** The website's two-handle price slider ("from - to" amounts above the track), driven by touch, no native module. */
export function PriceRangeSlider({ min, max, value, onChange }: PriceRangeSliderProps) {
  const s = useThemedStyles(styles);
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const step = priceStep(min, max);

  // The responders are created once, so they read the live values through a ref.
  const live = useRef({ min, max, value, width, step, onChange });
  live.current = { min, max, value, width, step, onChange };
  const startValue = useRef(0);

  const makeResponder = (which: 'from' | 'to') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startValue.current = which === 'from' ? live.current.value[0] : live.current.value[1];
      },
      onPanResponderMove: (_e, gesture) => {
        const l = live.current;
        const startX = positionOf(startValue.current, l.min, l.max, l.width);
        const next = valueAt(startX + gesture.dx, l.min, l.max, l.width, l.step);
        l.onChange(which === 'from' ? moveFrom(l.value, next, l.min) : moveTo(l.value, next, l.max));
      },
    });
  const fromResponder = useRef(makeResponder('from')).current;
  const toResponder = useRef(makeResponder('to')).current;

  const [from, to] = value;
  const x1 = positionOf(from, min, max, width);
  const x2 = positionOf(to, min, max, width);

  const adjust = (which: 'from' | 'to') => (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
    onChange(which === 'from' ? moveFrom(value, from + delta, min) : moveTo(value, to + delta, max));
  };

  return (
    <View>
      <View style={s.values}>
        <Text style={s.value}>{formatPrice(from)}</Text>
        <Text style={s.value}>{formatPrice(to)}</Text>
      </View>
      <View style={s.area} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={s.track} />
        <View style={[s.active, { left: x1, width: Math.max(0, x2 - x1) }]} />
        {([['from', x1, from, fromResponder], ['to', x2, to, toResponder]] as const).map(([which, x, now, responder]) => (
          <View
            key={which}
            {...responder.panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${t('filters.price')}: ${which === 'from' ? t('mobile.priceFrom') : t('mobile.priceTo')}`}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={now}
            aria-valuetext={formatPrice(now)}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={adjust(which)}
            style={[s.hit, { left: x - MIN_TOUCH_TARGET / 2 }]}
          >
            <View style={s.thumb} />
          </View>
        ))}
      </View>
    </View>
  );
}
