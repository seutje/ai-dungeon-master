const LS_KEY = 'aidm_settings_v1';

export function createSettings() {
  const defaults = {
    colorMode: 'default', // 'default' | 'cb'
    telegraph: 'medium',  // 'low' | 'medium' | 'high'
    keymapScheme: 'arrows_wasd', // 'arrows_wasd' | 'vim_hjkl'
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (_) {}
  return defaults;
}

export function saveSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (_) {}
}

export function telegraphMultiplier(s) {
  return s.telegraph === 'low' ? 0.6 : s.telegraph === 'high' ? 1.4 : 1.0;
}

export function palette(s) {
  if (s.colorMode === 'cb') {
    return {
      bg: '#0e0e13', text: '#f0f0f0',
      playerFill: '#7ec8e3', playerStroke: '#2a7d9a',
      enemyFillA: '#f6c85f', enemyFillB: '#6f4e7c', enemyStroke: '#4a3b60',
      ring: '#88c0d0'
    };
  }
  return {
    bg: '#0e0e13', text: '#eaeaea',
    playerFill: '#4fb', playerStroke: '#2aa',
    enemyFillA: '#f95', enemyFillB: '#fd6', enemyStroke: '#a53',
    ring: '#79f'
  };
}

export function keymap(s) {
  if (s.keymapScheme === 'vim_hjkl') {
    return {
      Up: ['KeyK'], Down: ['KeyJ'], Left: ['KeyH'], Right: ['KeyL'],
      Dash: ['Space', 'ShiftLeft']
    };
  }
  // default: arrows + wasd
  return {
    Up: ['ArrowUp', 'KeyW'], Down: ['ArrowDown', 'KeyS'],
    Left: ['ArrowLeft', 'KeyA'], Right: ['ArrowRight', 'KeyD'],
    Dash: ['Space']
  };
}

