export function computeMenuPosition(rect: {top:number; bottom:number; left:number}, size: {width:number; height:number}, viewport: {width:number; height:number}): {top:number; left:number; placement:'below'|'above'} {
  const placement = rect.bottom + size.height + 8 <= viewport.height ? 'below' : 'above';
  return { top: Math.max(8, Math.min(placement === 'below' ? rect.bottom : rect.top - size.height, viewport.height - size.height - 8)), left: Math.max(8, Math.min(rect.left, viewport.width - size.width - 8)), placement };
}
