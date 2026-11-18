/** Map'i en fazla `max` girdiye indirir; en eski eklenenleri siler (uzun açık kalan sekmelerde bellek büyümesin). */
export function capMap<K, V>(map: Map<K, V>, max: number): void {
  if (map.size <= max) return;
  let extra = map.size - max;
  for (const key of map.keys()) {
    if (extra-- <= 0) break;
    map.delete(key);
  }
}
