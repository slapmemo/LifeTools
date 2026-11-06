import { describe, expect, it } from 'vitest';
import { computeMenuPosition } from '../src/modules/x-video/menu-position';
describe('X video menu position', () => {
  const size = {width:180,height:200}, viewport = {width:800,height:600};
  it('opens below when it fits', () => expect(computeMenuPosition({top:100,bottom:134,left:200},size,viewport)).toEqual({top:134,left:200,placement:'below'}));
  it('flips above at the bottom', () => expect(computeMenuPosition({top:550,bottom:584,left:200},size,viewport)).toEqual({top:350,left:200,placement:'above'}));
  it('clamps both horizontal edges', () => {
    expect(computeMenuPosition({top:100,bottom:134,left:-20},size,viewport).left).toBe(8);
    expect(computeMenuPosition({top:100,bottom:134,left:790},size,viewport).left).toBe(612);
  });
});
