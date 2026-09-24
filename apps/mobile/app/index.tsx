import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/context/AuthContext";
import { colors } from "../src/lib/theme";

const offsets = [{ x: -110, y: -65, r: "-28deg" }, { x: 65, y: -95, r: "22deg" }, { x: -45, y: 90, r: "-18deg" }, { x: 115, y: 55, r: "31deg" }];
export default function Index() {
  const { user, loading } = useAuth();
  const [introDone, setIntroDone] = useState(false);
  const pieces = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const glitch = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const assemble = Animated.stagger(115, pieces.map(value => Animated.timing(value, { toValue: 1, duration: 620, easing: Easing.out(Easing.back(1.35)), useNativeDriver: true })));
    const flicker = Animated.loop(Animated.sequence([
      Animated.delay(720), Animated.timing(glitch, { toValue: 1, duration: 35, useNativeDriver: true }), Animated.timing(glitch, { toValue: 0, duration: 55, useNativeDriver: true }),
      Animated.delay(180), Animated.timing(glitch, { toValue: 1, duration: 28, useNativeDriver: true }), Animated.timing(glitch, { toValue: 0, duration: 45, useNativeDriver: true }), Animated.delay(420)
    ]));
    assemble.start(); flicker.start();
    const timer = setTimeout(() => setIntroDone(true), 1_850);
    return () => { clearTimeout(timer); assemble.stop(); flicker.stop(); };
  }, []);
  if (introDone && !loading) return <Redirect href={user ? "/(tabs)" : "/login"} />;
  return <View style={styles.screen} accessibilityLabel="F4WE loading">
    <View style={styles.glitchWrap}>
      <Animated.Text style={[styles.ghost, styles.redGhost, { opacity: glitch }]}>F4WE</Animated.Text>
      <Animated.Text style={[styles.ghost, styles.blueGhost, { opacity: glitch }]}>F4WE</Animated.Text>
      <View style={styles.word}>{["F", "4", "W", "E"].map((letter, index) => <Animated.Text key={letter + index} style={[styles.letter, {
        opacity: pieces[index],
        transform: [
          { translateX: pieces[index].interpolate({ inputRange: [0, 1], outputRange: [offsets[index].x, 0] }) },
          { translateY: pieces[index].interpolate({ inputRange: [0, 1], outputRange: [offsets[index].y, 0] }) },
          { rotate: pieces[index].interpolate({ inputRange: [0, 1], outputRange: [offsets[index].r, "0deg"] }) },
          { scale: pieces[index].interpolate({ inputRange: [0, .65, 1], outputRange: [.45, 1.18, 1] }) }
        ]
      }]}>{letter}</Animated.Text>)}</View>
    </View>
    <Text style={styles.loading}>ASSEMBLING YOUR MUSIC</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  glitchWrap: { width: 290, height: 120, alignItems: "center", justifyContent: "center" }, word: { flexDirection: "row" },
  letter: { color: colors.text, fontSize: 68, fontWeight: "900", letterSpacing: 7, textShadowColor: colors.softRed, textShadowOffset: { width: 2, height: 0 }, textShadowRadius: 8 },
  ghost: { position: "absolute", fontSize: 68, fontWeight: "900", letterSpacing: 7 }, redGhost: { color: "#FF334F", transform: [{ translateX: -6 }, { translateY: 2 }] }, blueGhost: { color: "#38C9FF", transform: [{ translateX: 6 }, { translateY: -2 }] },
  loading: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 3, marginTop: 20 }
});
