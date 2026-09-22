export const colors = {
  background: "#090A0C", surface: "#15171B", raised: "#202329", border: "#2A2E35",
  text: "#FFFFFF", muted: "#A5A8AE", accent: "#FFFFFF", access: "#1DB954", blue: "#3498DB", red: "#E74C3C", gold: "#F4C542", white: "#FFFFFF", accentText: "#090A0C"
} as const;

export const rankColor = { Access: colors.access, Moderator: colors.blue, Admin: colors.red, Developer: colors.white } as const;
