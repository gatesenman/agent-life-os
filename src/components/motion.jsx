import React, { useEffect } from 'react';
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion';

export const spring = { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 };
export const softSpring = { type: 'spring', stiffness: 220, damping: 28 };

// 数字平滑补间
export function AnimatedNumber({ value, format = (v) => v.toFixed(0), className }) {
  const reduce = useReducedMotion();
  const mv = useSpring(value, { stiffness: 120, damping: 22, mass: 0.6 });
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => { reduce ? mv.jump(value) : mv.set(value); }, [value, reduce]);
  return <motion.span className={className}>{text}</motion.span>;
}

// 交错入场容器
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } } };
export const rise = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: softSpring } };
