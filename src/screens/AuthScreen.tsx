import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../../lib/supabase";
import { createStyles } from "../styles";

const styles = createStyles("Classic Dark");

type AuthMode = "login" | "register";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);

  const cleanEmail = email.trim().toLowerCase();

  const validate = () => {
    if (mode === "register" && name.trim().length < 2) {
      Alert.alert("Skriv inn navnet ditt", "Navnet må inneholde minst 2 tegn.");
      return false;
    }

    if (!cleanEmail.includes("@")) {
      Alert.alert("Ugyldig e-post", "Skriv inn en gyldig e-postadresse.");
      return false;
    }

    if (password.length < 6) {
      Alert.alert("For kort passord", "Passordet må inneholde minst 6 tegn.");
      return false;
    }

    return true;
  };

  const submit = async () => {
    if (!validate()) return;

    setWorking(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) Alert.alert("Innlogging feilet", error.message);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: name.trim(),
          },
        },
      });

      if (error) {
        Alert.alert("Registrering feilet", error.message);
        return;
      }

      if (!data.session) {
        Alert.alert(
          "Sjekk e-posten din",
          "Kontoen er opprettet. Bekreft e-postadressen før du logger inn."
        );
        setMode("login");
      }
    } finally {
      setWorking(false);
    }
  };

  const toggleMode = () => {
    setMode((current) => (current === "login" ? "register" : "login"));
  };

  return (
    <SafeAreaView style={styles.authScreen}>
      <StatusBar style="dark" />

      <View style={styles.authCard}>
        <Text style={styles.authEyebrow}>VELKOMMEN</Text>
        <Text style={styles.authTitle}>
          {mode === "login" ? "Logg inn" : "Opprett konto"}
        </Text>

        <Text style={styles.authDescription}>
          {mode === "login"
            ? "Logg inn for å bruke matdagboken."
            : "Registrer deg med e-post og passord."}
        </Text>

        {mode === "register" && (
          <>
            <Text style={styles.authLabel}>Navn</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={styles.authInput}
              placeholder="Fornavnet ditt"
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
            />
          </>
        )}

        <Text style={styles.authLabel}>E-post</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.authInput}
          placeholder="navn@epost.no"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Text style={styles.authLabel}>Passord</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={styles.authInput}
          placeholder="Minst 6 tegn"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={mode === "login" ? "password" : "newPassword"}
        />

        <Pressable
          style={[
            styles.authPrimaryButton,
            working && styles.authButtonDisabled,
          ]}
          onPress={submit}
          disabled={working}
        >
          {working ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.authPrimaryButtonText}>
              {mode === "login" ? "Logg inn" : "Opprett konto"}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.authSwitchButton}
          onPress={toggleMode}
          disabled={working}
        >
          <Text style={styles.authSwitchText}>
            {mode === "login"
              ? "Har du ikke konto? Registrer deg"
              : "Har du allerede konto? Logg inn"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
