import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle } from "react-native-svg";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

import type {
  DiaryItem,
  DiaryMap,
  Food,
  MatvaretabellenFood,
  MatvaretabellenResponse,
  Meal,
  MealTemplate,
  OpenFoodFactsResponse,
  OpenFoodFactsSearchResponse,
  Profile,
  Recipe,
  RecipeIngredient,
  WeightEntry,
} from "./src/types";
import {
  CUSTOM_FOODS_STORAGE_KEY,
  DIARY_STORAGE_KEY,
  GOAL_STORAGE_KEY,
  MATVARETABELLEN_STORAGE_KEY,
  OLD_DIARY_STORAGE_KEY,
} from "./src/constants";
import { defaultFoods, defaultProfile } from "./src/data/defaults";
import {
  formatDate,
  formatShortDate,
  getDateKey,
  getLastSevenDateKeys,
  moveDate,
  toSafeNumber,
} from "./src/utils/helpers";
import { createStyles } from "./src/styles";
import { THEME_STORAGE_KEY, isAppTheme, themeOrder, themes } from "./src/theme";
import type { AppTheme } from "./src/types";
import { AuthScreen } from "./src/screens/AuthScreen";
import { MealDetailScreen } from "./src/screens/MealDetailScreen";

// Innlogging og lasteskjerm bruker Classic Dark før brukerens lagrede tema er lest.
const styles = createStyles("Classic Dark");

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { hasError: boolean };

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uventet appfeil", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.loadingScreen}>
          <StatusBar style="dark" />
          <Text style={styles.loadingText}>Noe gikk galt</Text>
          <Text style={[styles.loadingText, { textAlign: "center", paddingHorizontal: 28 }]}>
            Start appen på nytt. Dataene dine er fortsatt lagret.
          </Text>
          <Pressable
            accessibilityRole="button"
            style={{ marginTop: 18, paddingHorizontal: 22, paddingVertical: 12 }}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.loadingText}>Prøv igjen</Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        Alert.alert("Feil", error.message);
      }

      setSession(data.session);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Kunne ikke logge ut", error.message);
    }
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Åpner appen …</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <AppErrorBoundary>
      <CalorieApp
        onSignOut={signOut}
        userId={session.user.id}
        accountName={String(session.user.user_metadata?.full_name ?? "")}
        accountEmail={session.user.email ?? ""}
      />
    </AppErrorBoundary>
  );
}

function CalorieApp({
  onSignOut,
  userId,
  accountName,
  accountEmail,
}: {
  onSignOut: () => Promise<void>;
  userId: string;
  accountName: string;
  accountEmail: string;
}) {
  const [search, setSearch] = useState("");
  const [matvaretabellenFoods, setMatvaretabellenFoods] = useState<
    Food[]
  >([]);
  const [onlineFoods, setOnlineFoods] = useState<Food[]>([]);
  const [isLoadingFoodDatabase, setIsLoadingFoodDatabase] =
    useState(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [foodDatabaseMessage, setFoodDatabaseMessage] = useState(
    "Laster norske matvarer …"
  );
  const [activeTab, setActiveTab] = useState<
    "Oversikt" | "Legg til" | "Historikk" | "Profil"
  >("Oversikt");
  const [appTheme, setAppTheme] = useState<AppTheme>("Classic Dark");
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const styles = useMemo(() => createStyles(appTheme), [appTheme]);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((savedTheme) => {
        if (mounted && isAppTheme(savedTheme)) {
          setAppTheme(savedTheme);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const chooseTheme = async (theme: AppTheme) => {
    setAppTheme(theme);
    setThemePickerOpen(false);

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      Alert.alert(
        "Kunne ikke lagre tema",
        "Fargen ble endret nå, men kan bli tilbakestilt neste gang appen åpnes."
      );
    }
  };
  const [historyTab, setHistoryTab] = useState<"Mat" | "Vekt">("Mat");
  const [historyPeriod, setHistoryPeriod] = useState<"7d" | "30d" | "90d" | "365d">("7d");
  const [selectedDate, setSelectedDate] = useState(getDateKey(new Date()));
  const [diaries, setDiaries] = useState<DiaryMap>({});
  const [customFoods, setCustomFoods] = useState<Food[]>([]);
  const [calorieGoal, setCalorieGoal] = useState(2200);
  const [goalInput, setGoalInput] = useState("2200");
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [favoriteFoods, setFavoriteFoods] = useState<Food[]>([]);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [pinnedFavoriteKeys, setPinnedFavoriteKeys] = useState<string[]>([]);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);

  useEffect(() => {
    AsyncStorage.getItem("norsk-kaloriapp-pinned-favorites")
      .then((value) => {
        if (value) setPinnedFavoriteKeys(JSON.parse(value));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      "norsk-kaloriapp-pinned-favorites",
      JSON.stringify(pinnedFavoriteKeys)
    ).catch(() => undefined);
  }, [pinnedFavoriteKeys]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateMeal, setTemplateMeal] =
    useState<MealType>("Frokost");
  const [templateItems, setTemplateItems] = useState<
    MealTemplateItem[]
  >([]);
  const [templateFoodSearch, setTemplateFoodSearch] = useState("");
  const [templateAmount, setTemplateAmount] = useState("100");
  const [selectedTemplateFood, setSelectedTemplateFood] =
    useState<Food | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(
    null
  );
  const [recipeName, setRecipeName] = useState("");
  const [recipeServings, setRecipeServings] = useState("2");
  const [recipeIngredients, setRecipeIngredients] = useState<
    RecipeIngredient[]
  >([]);
  const [recipeFoodSearch, setRecipeFoodSearch] = useState("");
  const [recipeAmount, setRecipeAmount] = useState("100");
  const [selectedRecipeFood, setSelectedRecipeFood] =
    useState<Food | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [targetWeightInput, setTargetWeightInput] = useState("");
  const [macroGoalOpen, setMacroGoalOpen] = useState(false);
  const [proteinGoalInput, setProteinGoalInput] = useState("");
  const [carbsGoalInput, setCarbsGoalInput] = useState("");
  const [fatGoalInput, setFatGoalInput] = useState("");
  const [macroSuggestionText, setMacroSuggestionText] = useState("");
  const [weightOpen, setWeightOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DiaryItem | null>(null);
  const [mealDetailOpen, setMealDetailOpen] = useState(false);
  const [mealDetailMeal, setMealDetailMeal] =
    useState<Meal>("Frokost");
  const [quickAddFood, setQuickAddFood] = useState<Food | null>(null);
  const [quickAmount, setQuickAmount] = useState("100");
  const [quickMeal, setQuickMeal] = useState<Meal>("Frokost");
  const [editAmount, setEditAmount] = useState("");
  const [editMeal, setEditMeal] = useState<Meal>("Frokost");
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "loading" | "saved" | "saving" | "error"
  >("loading");
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTorch, setScannerTorch] = useState(false);
  const scannerLinePosition = useRef(new Animated.Value(0)).current;
  const calorieRingProgress = useRef(new Animated.Value(0)).current;
  const dashboardFade = useRef(new Animated.Value(0)).current;
  const screenFade = useRef(new Animated.Value(1)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(12)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [isLookingUpProduct, setIsLookingUpProduct] = useState(false);
  const [scannedFood, setScannedFood] = useState<Food | null>(null);
  const [amountInput, setAmountInput] = useState("100");
  const [selectedMeal, setSelectedMeal] = useState<Meal>("Frokost");

  const [manualName, setManualName] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualAmount, setManualAmount] = useState("100");

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastOpacity.stopAnimation();
    toastTranslateY.stopAnimation();
    toastOpacity.setValue(0);
    toastTranslateY.setValue(12);

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(toastTranslateY, {
        toValue: 0,
        speed: 22,
        bounciness: 5,
        useNativeDriver: true,
      }),
    ]).start();

    toastTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: -8,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1700);
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const confirmDestructiveAction = (
    title: string,
    message: string,
    onConfirm: () => void
  ) => {
    if (Platform.OS === "web") {
      const confirmed =
        typeof window !== "undefined"
          ? window.confirm(`${title}\n\n${message}`)
          : false;

      if (confirmed) onConfirm();
      return;
    }

    Alert.alert(title, message, [
      { text: "Avbryt", style: "cancel" },
      { text: "Slett", style: "destructive", onPress: onConfirm },
    ]);
  };

  useEffect(() => {
    if (!scannerOpen || scannedFood || isLookingUpProduct) {
      scannerLinePosition.stopAnimation();
      scannerLinePosition.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scannerLinePosition, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(scannerLinePosition, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    scannerOpen,
    scannedFood,
    isLookingUpProduct,
    scannerLinePosition,
  ]);

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    loadSavedData();
  }, [userId]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    saveDiaries(diaries);

    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
    }

    setSyncStatus("saving");

    syncTimer.current = setTimeout(() => {
      saveCloudData();
    }, 900);

    return () => {
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
      }
    };
  }, [
    diaries,
    customFoods,
    favoriteFoods,
    recentFoods,
    weightEntries,
    recipes,
    mealTemplates,
    calorieGoal,
    profile,
    isLoaded,
    userId,
  ]);

  const normalizeDiaries = (rawDiaries: DiaryMap): DiaryMap => {
    const normalizedDiaries: DiaryMap = {};

    Object.entries(rawDiaries ?? {}).forEach(([dateKey, items]) => {
      normalizedDiaries[dateKey] = (items ?? []).map((item) => ({
        ...item,
        calories: toSafeNumber(item.calories),
        protein: toSafeNumber(item.protein),
        carbs: toSafeNumber(item.carbs),
        fat: toSafeNumber(item.fat),
        meal: item.meal || "Frokost",
      }));
    });

    return normalizedDiaries;
  };

  const normalizeFoods = (foods: Food[]): Food[] =>
    (foods ?? []).map((food) => ({
      ...food,
      calories: toSafeNumber(food.calories),
      protein: toSafeNumber(food.protein),
      carbs: toSafeNumber(food.carbs),
      fat: toSafeNumber(food.fat),
    }));

  const loadSavedData = async () => {
    setSyncStatus("loading");

    try {
      const savedDiaries = await AsyncStorage.getItem(DIARY_STORAGE_KEY);
      const oldSavedDiary = await AsyncStorage.getItem(
        OLD_DIARY_STORAGE_KEY
      );
      const savedGoal = await AsyncStorage.getItem(GOAL_STORAGE_KEY);
      const savedCustomFoods = await AsyncStorage.getItem(
        CUSTOM_FOODS_STORAGE_KEY
      );

      let localDiaries: DiaryMap = {};
      let localCustomFoods: Food[] = [];
      let localGoal = 2200;

      if (savedDiaries) {
        localDiaries = normalizeDiaries(JSON.parse(savedDiaries));
      } else if (oldSavedDiary) {
        const oldItems: DiaryItem[] = JSON.parse(oldSavedDiary);

        localDiaries = normalizeDiaries({
          [getDateKey(new Date())]: oldItems,
        });
      }

      if (savedCustomFoods) {
        localCustomFoods = normalizeFoods(
          JSON.parse(savedCustomFoods)
        );
      }

      if (savedGoal) {
        const parsedGoal = Number(savedGoal);

        if (!Number.isNaN(parsedGoal) && parsedGoal > 0) {
          localGoal = parsedGoal;
        }
      }

      const { data, error } = await supabase
        .from("user_app_data")
        .select(
          "calorie_goal, diaries, custom_foods, profile, favorite_foods, recent_foods, weight_entries, recipes, meal_templates"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        const cloudDiaries = normalizeDiaries(
          (data.diaries ?? {}) as DiaryMap
        );
        const cloudFoods = normalizeFoods(
          (data.custom_foods ?? []) as Food[]
        );
        const cloudGoal = Number(data.calorie_goal) || 2200;
        const cloudFavorites = normalizeFoods(
          (data.favorite_foods ?? []) as Food[]
        );
        const cloudRecents = normalizeFoods(
          (data.recent_foods ?? []) as Food[]
        );
        const cloudRecipes = (
          (data.recipes ?? []) as Recipe[]
        ).map((recipe) => ({
          ...recipe,
          servings: Math.max(1, Number(recipe.servings) || 1),
          ingredients: (recipe.ingredients ?? []).map((ingredient) => ({
            ...ingredient,
            amountGrams: toSafeNumber(ingredient.amountGrams),
            food: {
              ...ingredient.food,
              calories: toSafeNumber(ingredient.food?.calories),
              protein: toSafeNumber(ingredient.food?.protein),
              carbs: toSafeNumber(ingredient.food?.carbs),
              fat: toSafeNumber(ingredient.food?.fat),
            },
          })),
        }));

        const cloudMealTemplates = (
          (data.meal_templates ?? []) as MealTemplate[]
        ).map((template) => ({
          ...template,
          meal: template.meal ?? "Frokost",
          items: (template.items ?? []).map((item) => ({
            ...item,
            amountGrams: toSafeNumber(item.amountGrams),
            food: {
              ...item.food,
              calories: toSafeNumber(item.food?.calories),
              protein: toSafeNumber(item.food?.protein),
              carbs: toSafeNumber(item.food?.carbs),
              fat: toSafeNumber(item.food?.fat),
            },
          })),
        }));

        const cloudWeights = (
          (data.weight_entries ?? []) as WeightEntry[]
        )
          .map((entry) => ({
            ...entry,
            weightKg: toSafeNumber(entry.weightKg),
          }))
          .filter((entry) => entry.weightKg > 0)
          .sort((a, b) => a.date.localeCompare(b.date));

        const cloudProfile: Profile = {
          ...defaultProfile,
          ...((data.profile ?? {}) as Partial<Profile>),
        };

        if (!cloudProfile.name.trim() && accountName.trim()) {
          cloudProfile.name = accountName.trim();
        }

        setDiaries(cloudDiaries);
        setCustomFoods(cloudFoods);
        setFavoriteFoods(cloudFavorites);
        setRecentFoods(cloudRecents);
        setWeightEntries(cloudWeights);
        setRecipes(cloudRecipes);
        setMealTemplates(cloudMealTemplates);
        setCalorieGoal(cloudGoal);
        setGoalInput(String(cloudGoal));
        setProfile(cloudProfile);

        await AsyncStorage.multiSet([
          [DIARY_STORAGE_KEY, JSON.stringify(cloudDiaries)],
          [CUSTOM_FOODS_STORAGE_KEY, JSON.stringify(cloudFoods)],
          [GOAL_STORAGE_KEY, String(cloudGoal)],
        ]);
      } else {
        setDiaries(localDiaries);
        setCustomFoods(localCustomFoods);
        setCalorieGoal(localGoal);
        setGoalInput(String(localGoal));
        const initialProfile = {
          ...defaultProfile,
          name: accountName.trim(),
        };
        setProfile(initialProfile);

        const { error: insertError } = await supabase
          .from("user_app_data")
          .insert({
            user_id: userId,
            calorie_goal: localGoal,
            diaries: localDiaries,
            custom_foods: localCustomFoods,
            favorite_foods: [],
            recent_foods: [],
            weight_entries: [],
            recipes: [],
            meal_templates: [],
            profile: initialProfile,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
        }
      }

      setSyncStatus("saved");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      Alert.alert(
        "Synkronisering feilet",
        "Appen bruker fortsatt data som ligger på mobilen."
      );
    } finally {
      setIsLoaded(true);
    }
  };

  const saveCloudData = async () => {
    try {
      const { error } = await supabase
        .from("user_app_data")
        .upsert(
          {
            user_id: userId,
            calorie_goal: calorieGoal,
            diaries,
            custom_foods: customFoods,
            favorite_foods: favoriteFoods,
            recent_foods: recentFoods,
            weight_entries: weightEntries,
            recipes,
            meal_templates: mealTemplates,
            profile,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

      if (error) {
        throw error;
      }

      await AsyncStorage.multiSet([
        [DIARY_STORAGE_KEY, JSON.stringify(diaries)],
        [CUSTOM_FOODS_STORAGE_KEY, JSON.stringify(customFoods)],
        [GOAL_STORAGE_KEY, String(calorieGoal)],
      ]);

      setSyncStatus("saved");
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
    }
  };

  const saveDiaries = async (items: DiaryMap) => {
    try {
      await AsyncStorage.setItem(
        DIARY_STORAGE_KEY,
        JSON.stringify(items)
      );
    } catch {
      Alert.alert("Feil", "Kunne ikke lagre matdagboken.");
    }
  };

  const diary = diaries[selectedDate] ?? [];

  const updateDiary = (
    updater: (currentDiary: DiaryItem[]) => DiaryItem[]
  ) => {
    setDiaries((currentDiaries) => {
      const currentDiary = currentDiaries[selectedDate] ?? [];

      return {
        ...currentDiaries,
        [selectedDate]: updater(currentDiary),
      };
    });
  };

  const copyPreviousDayToSelectedDate = () => {
    const previousDate = moveDate(selectedDate, -1);
    const previousDiary = diaries[previousDate] ?? [];
    const currentDiary = diaries[selectedDate] ?? [];

    if (previousDiary.length === 0) {
      Alert.alert(
        "Ingen mat å kopiere",
        `${formatDate(previousDate)} har ingen registrerte matvarer.`
      );
      return;
    }

    const copiedItems = previousDiary.map((item, index) => ({
      ...item,
      diaryId: `copied-${selectedDate}-${Date.now()}-${index}`,
    }));

    const performCopy = () => {
      setDiaries((currentDiaries) => ({
        ...currentDiaries,
        [selectedDate]: [
          ...(currentDiaries[selectedDate] ?? []),
          ...copiedItems,
        ],
      }));

      Alert.alert(
        "Måltider kopiert",
        `${previousDiary.length} matvarer ble kopiert fra ${formatDate(
          previousDate
        )} til ${formatDate(selectedDate)}.`
      );
    };

    if (currentDiary.length > 0) {
      Alert.alert(
        "Det finnes allerede mat denne dagen",
        "De kopierte matvarene blir lagt til i tillegg til det som allerede er registrert.",
        [
          { text: "Avbryt", style: "cancel" },
          { text: "Kopier likevel", onPress: performCopy },
        ]
      );
      return;
    }

    performCopy();
  };


  const copyCurrentDayToTomorrow = () => {
    const targetDate = moveDate(selectedDate, 1);
    const sourceDiary = diaries[selectedDate] ?? [];

    if (sourceDiary.length === 0) {
      Alert.alert("Ingen mat å kopiere", "Denne dagen har ingen registrerte matvarer.");
      return;
    }

    const copiedItems = sourceDiary.map((item, index) => ({
      ...item,
      diaryId: `copied-${targetDate}-${Date.now()}-${index}`,
    }));

    const performCopy = () => {
      setDiaries((current) => ({
        ...current,
        [targetDate]: [...(current[targetDate] ?? []), ...copiedItems],
      }));
      Alert.alert("Dagen er kopiert", `${sourceDiary.length} matvarer ble kopiert til ${formatDate(targetDate)}.`);
    };

    if ((diaries[targetDate] ?? []).length > 0) {
      Alert.alert("Det finnes allerede mat i morgen", "De kopierte matvarene blir lagt til det som allerede finnes.", [
        { text: "Avbryt", style: "cancel" },
        { text: "Kopier likevel", onPress: performCopy },
      ]);
      return;
    }

    performCopy();
  };

  const copyMealToTomorrow = (meal: Meal) => {
    const targetDate = moveDate(selectedDate, 1);
    const mealItems = (diaries[selectedDate] ?? []).filter((item) => item.meal === meal);

    if (mealItems.length === 0) {
      Alert.alert("Måltidet er tomt", "Det finnes ingen matvarer å kopiere.");
      return;
    }

    const copiedItems = mealItems.map((item, index) => ({
      ...item,
      diaryId: `copied-meal-${targetDate}-${Date.now()}-${index}`,
    }));

    setDiaries((current) => ({
      ...current,
      [targetDate]: [...(current[targetDate] ?? []), ...copiedItems],
    }));
    Alert.alert("Måltidet er kopiert", `${mealItems.length} matvarer ble kopiert til ${formatDate(targetDate)}.`);
  };

  const saveCustomFoods = async (items: Food[]) => {
    try {
      await AsyncStorage.setItem(
        CUSTOM_FOODS_STORAGE_KEY,
        JSON.stringify(items)
      );
    } catch {
      Alert.alert("Feil", "Kunne ikke lagre produktet.");
    }
  };

  const saveCalorieGoal = async () => {
    Keyboard.dismiss();
    const newGoal = Number(goalInput);

    if (Number.isNaN(newGoal) || newGoal < 500 || newGoal > 10000) {
      Alert.alert(
        "Ugyldig mål",
        "Skriv inn et kalorimål mellom 500 og 10 000."
      );
      return;
    }

    setCalorieGoal(newGoal);

    try {
      await AsyncStorage.setItem(GOAL_STORAGE_KEY, String(newGoal));
      Alert.alert("Lagret", `Kalorimålet er satt til ${newGoal} kcal.`);
    } catch {
      Alert.alert("Feil", "Kunne ikke lagre kalorimålet.");
    }
  };


  useEffect(() => {
    let cancelled = false;

    const normalizeMatvaretabellenFood = (
      item: MatvaretabellenFood
    ): Food | null => {
      const calories = toSafeNumber(item.Energi2?.value);
      const name = item.name?.trim();

      if (!name || calories <= 0) {
        return null;
      }

      return {
        id: `mvt-${item.id ?? name}`,
        name,
        calories: Math.round(calories),
        protein:
          Math.round(toSafeNumber(item.Protein?.value) * 10) / 10,
        carbs:
          Math.round(toSafeNumber(item.Karbo?.value) * 10) / 10,
        fat: Math.round(toSafeNumber(item.Fett?.value) * 10) / 10,
        source: "Matvaretabellen",
      };
    };

    const loadMatvaretabellen = async () => {
      setIsLoadingFoodDatabase(true);

      try {
        const cached = await AsyncStorage.getItem(
          MATVARETABELLEN_STORAGE_KEY
        );

        if (cached) {
          const parsed = JSON.parse(cached) as Food[];

          if (!cancelled && Array.isArray(parsed) && parsed.length > 0) {
            setMatvaretabellenFoods(parsed);
            setFoodDatabaseMessage(
              `${parsed.length} norske matvarer klare`
            );
            setIsLoadingFoodDatabase(false);
            return;
          }
        }

        const response = await fetch(
          "https://www.matvaretabellen.no/api/nb/foods.json"
        );

        if (!response.ok) {
          throw new Error("Kunne ikke hente Matvaretabellen");
        }

        const data =
          (await response.json()) as MatvaretabellenResponse;

        const normalized = (data.foods ?? [])
          .map(normalizeMatvaretabellenFood)
          .filter((food): food is Food => food !== null);

        if (!cancelled) {
          setMatvaretabellenFoods(normalized);
          setFoodDatabaseMessage(
            `${normalized.length} norske matvarer klare`
          );
        }

        await AsyncStorage.setItem(
          MATVARETABELLEN_STORAGE_KEY,
          JSON.stringify(normalized)
        );
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setFoodDatabaseMessage(
            "Norske matvarer kunne ikke lastes. Prøv igjen med nett."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFoodDatabase(false);
        }
      }
    };

    loadMatvaretabellen();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const normalizedSearch = search.trim();

    if (normalizedSearch.length < 3) {
      setOnlineFoods([]);
      setIsSearchingOnline(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);

      try {
        const fields = [
          "code",
          "product_name",
          "product_name_no",
          "generic_name",
          "brands",
          "countries_tags",
          "nutriments",
        ].join(",");

        const baseQuery =
          `search_terms=${encodeURIComponent(normalizedSearch)}` +
          "&search_simple=1&action=process&json=1" +
          `&fields=${encodeURIComponent(fields)}`;

        const norwayQuery =
          `${baseQuery}&page_size=100` +
          "&tagtype_0=countries" +
          "&tag_contains_0=contains" +
          `&tag_0=${encodeURIComponent("Norway")}`;

        const generalQuery = `${baseQuery}&page_size=80`;

        const endpoints = [
          `https://no.openfoodfacts.org/cgi/search.pl?${norwayQuery}`,
          `https://world.openfoodfacts.org/cgi/search.pl?${norwayQuery}`,
          `https://no.openfoodfacts.org/cgi/search.pl?${generalQuery}`,
          `https://world.openfoodfacts.org/cgi/search.pl?${generalQuery}`,
        ];

        const responses: OpenFoodFactsSearchResponse[] = [];

        for (const endpoint of endpoints) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 9000);

            const response = await fetch(endpoint, {
              signal: controller.signal,
              headers: {
                Accept: "application/json",
              },
            });

            clearTimeout(timeout);

            if (response.ok) {
              responses.push(
                (await response.json()) as OpenFoodFactsSearchResponse
              );
            }
          } catch {
            // Fortsett med neste server uten rød Expo-feilskjerm.
          }
        }

        if (responses.length === 0) {
          throw new Error("ONLINE_SEARCH_UNAVAILABLE");
        }

        const products = responses.flatMap(
          (response) => response.products ?? []
        );

        const normalized = products
          .map((product): Food | null => {
            const calories = toSafeNumber(
              product.nutriments?.["energy-kcal_100g"]
            );

            const name =
              product.product_name_no?.trim() ||
              product.product_name?.trim() ||
              product.generic_name?.trim();

            if (!name || calories <= 0 || !product.code) {
              return null;
            }

            return {
              id: `off-${product.code}`,
              barcode: product.code,
              name,
              brand: product.brands?.trim(),
              calories: Math.round(calories),
              protein:
                Math.round(
                  toSafeNumber(product.nutriments?.proteins_100g) *
                    10
                ) / 10,
              carbs:
                Math.round(
                  toSafeNumber(
                    product.nutriments?.carbohydrates_100g
                  ) * 10
                ) / 10,
              fat:
                Math.round(
                  toSafeNumber(product.nutriments?.fat_100g) * 10
                ) / 10,
              source: "Open Food Facts",
              isNorwegianProduct:
                product.countries_tags?.some(
                  (country) =>
                    country === "en:norway" ||
                    country === "no:norge" ||
                    country.endsWith(":norway")
                ) ?? false,
            };
          })
          .filter((food): food is Food => food !== null);

        const unique = Array.from(
          new Map(normalized.map((food) => [food.id, food])).values()
        ).sort((a, b) => {
          const norwayDifference =
            Number(b.isNorwegianProduct) -
            Number(a.isNorwegianProduct);

          if (norwayDifference !== 0) {
            return norwayDifference;
          }

          return a.name.localeCompare(b.name, "nb");
        });

        if (!cancelled) {
          setOnlineFoods(unique);
          setFoodDatabaseMessage(
            `${matvaretabellenFoods.length} norske matvarer klare`
          );
        }
      } catch {
        if (!cancelled) {
          setOnlineFoods([]);
          setFoodDatabaseMessage(
            `${matvaretabellenFoods.length} norske matvarer klare · nettsøk midlertidig utilgjengelig`
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearchingOnline(false);
        }
      }
    }, 650);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, matvaretabellenFoods.length]);

  const allFoods = useMemo(
    () => [
      ...customFoods.map((food) => ({
        ...food,
        source: food.source ?? ("Egen" as const),
      })),
      ...defaultFoods.map((food) => ({
        ...food,
        source: food.source ?? ("Standard" as const),
      })),
      ...matvaretabellenFoods,
    ],
    [customFoods, matvaretabellenFoods]
  );

  const filteredFoods = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return allFoods.slice(0, 60);
    }

    const localMatches = allFoods
      .filter((food) => {
        const searchable =
          `${food.name} ${food.brand ?? ""}`.toLowerCase();

        return searchable.includes(normalizedSearch);
      })
      .slice(0, 80);

    const seen = new Set(localMatches.map((food) => food.id));

    const onlineMatches = onlineFoods
      .filter((food) => !seen.has(food.id))
      .sort((a, b) => {
        const norwayDifference =
          Number(b.isNorwegianProduct) -
          Number(a.isNorwegianProduct);

        if (norwayDifference !== 0) {
          return norwayDifference;
        }

        const aStarts = a.name
          .toLowerCase()
          .startsWith(normalizedSearch);
        const bStarts = b.name
          .toLowerCase()
          .startsWith(normalizedSearch);

        if (aStarts !== bStarts) {
          return Number(bStarts) - Number(aStarts);
        }

        return a.name.localeCompare(b.name, "nb");
      });

    return [...localMatches, ...onlineMatches].slice(0, 180);
  }, [search, allFoods, onlineFoods]);

  const caloriesEaten = diary.reduce(
    (total, item) => total + toSafeNumber(item.calories),
    0
  );

  const proteinEaten = diary.reduce(
    (total, item) => total + toSafeNumber(item.protein),
    0
  );

  const carbsEaten = diary.reduce(
    (total, item) => total + toSafeNumber(item.carbs),
    0
  );

  const fatEaten = diary.reduce(
    (total, item) => total + toSafeNumber(item.fat),
    0
  );

  const mealDistribution = (
    [
      "Frokost",
      "Lunsj",
      "Middag",
      "Mellommåltid",
    ] as Meal[]
  ).map((meal) => {
    const items = diary.filter((item) => item.meal === meal);

    return {
      meal,
      calories: items.reduce(
        (total, item) => total + toSafeNumber(item.calories),
        0
      ),
      protein: items.reduce(
        (total, item) => total + toSafeNumber(item.protein),
        0
      ),
      carbs: items.reduce(
        (total, item) => total + toSafeNumber(item.carbs),
        0
      ),
      fat: items.reduce(
        (total, item) => total + toSafeNumber(item.fat),
        0
      ),
    };
  });

  const highestMealCalories = Math.max(
    1,
    ...mealDistribution.map((item) => item.calories)
  );

  const proteinGoal = Math.max(
    0,
    toSafeNumber(profile.proteinGoal)
  );
  const carbsGoal = Math.max(0, toSafeNumber(profile.carbsGoal));
  const fatGoal = Math.max(0, toSafeNumber(profile.fatGoal));

  const proteinProgress =
    proteinGoal > 0
      ? Math.min(100, (proteinEaten / proteinGoal) * 100)
      : 0;
  const carbsProgress =
    carbsGoal > 0
      ? Math.min(100, (carbsEaten / carbsGoal) * 100)
      : 0;
  const fatProgress =
    fatGoal > 0
      ? Math.min(100, (fatEaten / fatGoal) * 100)
      : 0;

  const caloriesRemaining = calorieGoal - caloriesEaten;

  const calorieProgress =
    calorieGoal > 0
      ? Math.max(0, Math.min(1, caloriesEaten / calorieGoal))
      : 0;

  const calorieRingRadius = 74;
  const calorieRingCircumference =
    2 * Math.PI * calorieRingRadius;
  const calorieRingOffset =
    calorieRingCircumference * (1 - calorieProgress);


  const foodKey = (food: Food) =>
    food.barcode ? `barcode:${food.barcode}` : `id:${food.id}`;

  const isFavorite = (food: Food) =>
    favoriteFoods.some(
      (favorite) => foodKey(favorite) === foodKey(food)
    );

  const togglePinnedFavorite = (food: Food) => {
    const key = foodKey(food);
    setPinnedFavoriteKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [key, ...current]
    );
  };

  const isPinnedFavorite = (food: Food) =>
    pinnedFavoriteKeys.includes(foodKey(food));

  const visibleFavoriteFoods = favoriteFoods
    .filter((food) =>
      food.name.toLowerCase().includes(favoriteSearch.trim().toLowerCase())
    )
    .sort((a, b) => {
      const aPinned = isPinnedFavorite(a) ? 1 : 0;
      const bPinned = isPinnedFavorite(b) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aRecent = recentFoods.findIndex((item) => foodKey(item) === foodKey(a));
      const bRecent = recentFoods.findIndex((item) => foodKey(item) === foodKey(b));
      const aRank = aRecent === -1 ? 999 : aRecent;
      const bRank = bRecent === -1 ? 999 : bRecent;
      return aRank - bRank;
    });

  const toggleFavorite = (food: Food) => {
    setFavoriteFoods((current) => {
      const exists = current.some(
        (favorite) => foodKey(favorite) === foodKey(food)
      );

      if (exists) {
        return current.filter(
          (favorite) => foodKey(favorite) !== foodKey(food)
        );
      }

      return [food, ...current].slice(0, 30);
    });
  };

  const addToRecent = (food: Food) => {
    setRecentFoods((current) => {
      const withoutDuplicate = current.filter(
        (item) => foodKey(item) !== foodKey(food)
      );

      return [food, ...withoutDuplicate].slice(0, 12);
    });
  };

  const foodUsesGrams = (food: Food) =>
    Boolean(food.barcode) ||
    food.id.startsWith("manual-") ||
    /100\s*g/i.test(food.name);

  const openQuickAdd = (food: Food) => {
    const usesGrams = foodUsesGrams(food);

    setQuickAddFood(food);
    setQuickAmount(usesGrams ? "100" : "1");
    setQuickMeal(selectedMeal);
  };

  const confirmQuickAdd = () => {
    if (!quickAddFood) {
      return;
    }

    const amount = Number(quickAmount.replace(",", "."));
    const usesGrams = foodUsesGrams(quickAddFood);

    if (
      Number.isNaN(amount) ||
      amount <= 0 ||
      (usesGrams && amount > 5000) ||
      (!usesGrams && amount > 20)
    ) {
      Alert.alert(
        "Ugyldig mengde",
        usesGrams
          ? "Skriv inn en mengde mellom 1 og 5000 gram."
          : "Skriv inn mellom 1 og 20 porsjoner."
      );
      return;
    }

    const factor = usesGrams ? amount / 100 : amount;
    const cleanName = quickAddFood.name
      .replace(/\s*[–-]\s*\d+(?:[.,]\d+)?\s*g$/i, "")
      .replace(/\s*100\s*g$/i, "")
      .trim();

    const newItem: DiaryItem = {
      ...quickAddFood,
      name: usesGrams
        ? `${cleanName} – ${amount} g`
        : amount === 1
          ? cleanName
          : `${cleanName} × ${amount}`,
      calories: Math.round(
        toSafeNumber(quickAddFood.calories) * factor
      ),
      protein:
        Math.round(
          toSafeNumber(quickAddFood.protein) * factor * 10
        ) / 10,
      carbs:
        Math.round(
          toSafeNumber(quickAddFood.carbs) * factor * 10
        ) / 10,
      fat:
        Math.round(
          toSafeNumber(quickAddFood.fat) * factor * 10
        ) / 10,
      diaryId: `${quickAddFood.id}-${Date.now()}`,
      meal: quickMeal,
      amountGrams: usesGrams ? amount : undefined,
    };

    addToRecent(quickAddFood);
    updateDiary((currentDiary) => [...currentDiary, newItem]);
    setSelectedMeal(quickMeal);
    setQuickAddFood(null);
    showToast(`${cleanName} lagt til i ${quickMeal.toLowerCase()}`);
  };

  const removeFood = (diaryId: string) => {
    updateDiary((currentDiary) =>
      currentDiary.filter((item) => item.diaryId !== diaryId)
    );
    showToast("Matvaren ble fjernet");
  };

  const clearDiary = () => {
    if (diary.length === 0) {
      return;
    }

    Alert.alert(
      "Tøm matdagboken",
      `Vil du fjerne alle matvarer for ${formatDate(selectedDate)}?`,
      [
        {
          text: "Avbryt",
          style: "cancel",
        },
        {
          text: "Tøm",
          style: "destructive",
          onPress: () => updateDiary(() => []),
        },
      ]
    );
  };

  const openScanner = async () => {
    setScannedFood(null);
    setHasScanned(false);
    setAmountInput("100");

    if (!permission?.granted) {
      const result = await requestPermission();

      if (!result.granted) {
        Alert.alert(
          "Kameratilgang mangler",
          "Du må tillate kamera for å skanne strekkoder."
        );
        return;
      }
    }

    setScannerOpen(true);
  };

  const closeScanner = () => {
    setScannerTorch(false);
    setScannerOpen(false);
    setHasScanned(false);
    setScannedFood(null);
    setIsLookingUpProduct(false);
    setAmountInput("100");
  };

  const handleBarcodeScanned = async (
    result: BarcodeScanningResult
  ) => {
    if (hasScanned || isLookingUpProduct) {
      return;
    }

    setHasScanned(true);
    setIsLookingUpProduct(true);

    const barcode = result.data.trim();

    try {
      const localProduct = customFoods.find(
        (food) => food.barcode === barcode
      );

      const fields = [
        "code",
        "product_name",
        "product_name_no",
        "generic_name",
        "nutriments",
      ].join(",");

      const url =
        `https://world.openfoodfacts.org/api/v3/product/` +
        `${encodeURIComponent(barcode)}?fields=${fields}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "NorskKaloriapp/0.2",
        },
      });

      if (!response.ok) {
        throw new Error("Produktoppslaget feilet");
      }

      const data: OpenFoodFactsResponse = await response.json();
      const product = data.product;

      if (!product) {
        Alert.alert(
          "Produktet ble ikke funnet",
          "Denne strekkoden finnes ikke i databasen ennå."
        );
        setHasScanned(false);
        return;
      }

      const name =
        product.product_name_no ||
        product.product_name ||
        product.generic_name ||
        `Produkt ${barcode}`;

      const calories =
        product.nutriments?.["energy-kcal_100g"] ??
        product.nutriments?.["energy-kcal"];

      const protein =
        product.nutriments?.proteins_100g ??
        product.nutriments?.proteins;

      const carbs =
        product.nutriments?.carbohydrates_100g ??
        product.nutriments?.carbohydrates;

      const fat =
        product.nutriments?.fat_100g ??
        product.nutriments?.fat;

      if (
        !Number.isFinite(toSafeNumber(calories)) ||
        toSafeNumber(calories) <= 0
      ) {
        Alert.alert(
          "Mangler næringsinnhold",
          "Produktet finnes, men kalorier er ikke registrert."
        );
        setHasScanned(false);
        return;
      }

      const food: Food = {
        id: `barcode-${barcode}`,
        name,
        calories: Math.round(toSafeNumber(calories)),
        protein: Math.round(toSafeNumber(protein) * 10) / 10,
        carbs: Math.round(toSafeNumber(carbs) * 10) / 10,
        fat: Math.round(toSafeNumber(fat) * 10) / 10,
        barcode,
      };

      setScannedFood(food);
    } catch {
      const localProduct = customFoods.find(
        (food) => food.barcode === barcode
      );

      if (localProduct) {
        setScannedFood({
          ...localProduct,
          calories: toSafeNumber(localProduct.calories),
          protein: toSafeNumber(localProduct.protein),
          carbs: toSafeNumber(localProduct.carbs),
          fat: toSafeNumber(localProduct.fat),
        });
      } else {
        Alert.alert(
          "Kunne ikke hente produktet",
          "Kontroller internettforbindelsen og prøv igjen."
        );
        setHasScanned(false);
      }
    } finally {
      setIsLookingUpProduct(false);
    }
  };

  const selectedAmount = Number(amountInput);
  const validAmount =
    !Number.isNaN(selectedAmount) &&
    selectedAmount > 0 &&
    selectedAmount <= 5000;

  const calculatedCalories =
    scannedFood && validAmount
      ? Math.round((scannedFood.calories * selectedAmount) / 100)
      : 0;

  const calculatedProtein =
    scannedFood && validAmount
      ? Math.round(
          ((toSafeNumber(scannedFood.protein) * selectedAmount) / 100) *
            10
        ) / 10
      : 0;

  const calculatedCarbs =
    scannedFood && validAmount
      ? Math.round(
          ((toSafeNumber(scannedFood.carbs) * selectedAmount) / 100) *
            10
        ) / 10
      : 0;

  const calculatedFat =
    scannedFood && validAmount
      ? Math.round(
          ((toSafeNumber(scannedFood.fat) * selectedAmount) / 100) *
            10
        ) / 10
      : 0;

  const addScannedFood = async () => {
    if (!scannedFood) {
      return;
    }

    if (!validAmount) {
      Alert.alert(
        "Ugyldig mengde",
        "Skriv inn en mengde mellom 1 og 5000 gram."
      );
      return;
    }

    const productAlreadySaved = customFoods.some(
      (food) => food.barcode === scannedFood.barcode
    );

    const updatedFoods = productAlreadySaved
      ? customFoods.map((food) =>
          food.barcode === scannedFood.barcode ? scannedFood : food
        )
      : [scannedFood, ...customFoods];

    setCustomFoods(updatedFoods);
    await saveCustomFoods(updatedFoods);

    addToRecent(scannedFood);

    const diaryItem: DiaryItem = {
      ...scannedFood,
      name: `${scannedFood.name} – ${selectedAmount} g`,
      calories: calculatedCalories,
      protein: calculatedProtein,
      carbs: calculatedCarbs,
      fat: calculatedFat,
      amountGrams: selectedAmount,
      diaryId: `${scannedFood.id}-${Date.now()}`,
      meal: selectedMeal,
    };

    updateDiary((currentDiary) => [...currentDiary, diaryItem]);
    closeScanner();
  };

  const openManualEntry = () => {
    setManualName("");
    setManualCalories("");
    setManualProtein("");
    setManualCarbs("");
    setManualFat("");
    setManualAmount("100");
    setManualOpen(true);
  };

  const closeManualEntry = () => {
    setManualOpen(false);
  };

  const addManualFood = async () => {
    const caloriesPer100 = Number(manualCalories.replace(",", "."));
    const proteinPer100 = Number(manualProtein.replace(",", "."));
    const carbsPer100 = Number(manualCarbs.replace(",", "."));
    const fatPer100 = Number(manualFat.replace(",", "."));
    const amount = Number(manualAmount.replace(",", "."));

    if (!manualName.trim()) {
      Alert.alert("Mangler navn", "Skriv inn navnet på varen.");
      return;
    }

    if (
      Number.isNaN(caloriesPer100) ||
      caloriesPer100 < 0 ||
      caloriesPer100 > 2000
    ) {
      Alert.alert(
        "Ugyldige kalorier",
        "Skriv inn kalorier per 100 gram."
      );
      return;
    }

    if (
      Number.isNaN(proteinPer100) ||
      proteinPer100 < 0 ||
      proteinPer100 > 100
    ) {
      Alert.alert(
        "Ugyldig protein",
        "Skriv inn protein per 100 gram."
      );
      return;
    }

    if (
      Number.isNaN(carbsPer100) ||
      carbsPer100 < 0 ||
      carbsPer100 > 100
    ) {
      Alert.alert(
        "Ugyldige karbohydrater",
        "Skriv inn karbohydrater per 100 gram."
      );
      return;
    }

    if (
      Number.isNaN(fatPer100) ||
      fatPer100 < 0 ||
      fatPer100 > 100
    ) {
      Alert.alert(
        "Ugyldig fett",
        "Skriv inn fett per 100 gram."
      );
      return;
    }

    if (Number.isNaN(amount) || amount <= 0 || amount > 5000) {
      Alert.alert(
        "Ugyldig mengde",
        "Skriv inn en mengde mellom 1 og 5000 gram."
      );
      return;
    }

    const baseFood: Food = {
      id: `manual-${Date.now()}`,
      name: manualName.trim(),
      calories: Math.round(caloriesPer100),
      protein: Math.round(proteinPer100 * 10) / 10,
      carbs: Math.round(carbsPer100 * 10) / 10,
      fat: Math.round(fatPer100 * 10) / 10,
    };

    const updatedFoods = [baseFood, ...customFoods];
    setCustomFoods(updatedFoods);
    await saveCustomFoods(updatedFoods);

    addToRecent(baseFood);

    const diaryItem: DiaryItem = {
      ...baseFood,
      name: `${baseFood.name} – ${amount} g`,
      calories: Math.round((caloriesPer100 * amount) / 100),
      protein:
        Math.round(((proteinPer100 * amount) / 100) * 10) / 10,
      carbs:
        Math.round(((carbsPer100 * amount) / 100) * 10) / 10,
      fat:
        Math.round(((fatPer100 * amount) / 100) * 10) / 10,
      amountGrams: amount,
      meal: selectedMeal,
      diaryId: `${baseFood.id}-diary`,
    };

    updateDiary((currentDiary) => [...currentDiary, diaryItem]);
    closeManualEntry();
  };

  const meals: Meal[] = [
    "Frokost",
    "Lunsj",
    "Middag",
    "Mellommåltid",
  ];

  const diaryByMeal = meals.map((meal) => ({
    meal,
    items: diary.filter((item) => item.meal === meal),
  }));

  const historyPeriodOptions = [
    { key: "7d" as const, label: "7 dager", days: 7, title: "Siste 7 dager" },
    { key: "30d" as const, label: "30 dager", days: 30, title: "Siste 30 dager" },
    { key: "90d" as const, label: "90 dager", days: 90, title: "Siste 90 dager" },
    { key: "365d" as const, label: "1 år", days: 365, title: "Siste 12 måneder" },
  ];

  const activeHistoryPeriod =
    historyPeriodOptions.find((option) => option.key === historyPeriod) ??
    historyPeriodOptions[0];
  const historyPeriodDays = activeHistoryPeriod.days;

  const historyDateKeys = Array.from({ length: historyPeriodDays }, (_, index) =>
    moveDate(selectedDate, -(historyPeriodDays - 1 - index))
  );

  const makeHistoryRow = (dateKey: string) => {
    const items = diaries[dateKey] ?? [];
    return {
      dateKey,
      calories: items.reduce((total, item) => total + toSafeNumber(item.calories), 0),
      protein: items.reduce((total, item) => total + toSafeNumber(item.protein), 0),
      carbs: items.reduce((total, item) => total + toSafeNumber(item.carbs), 0),
      fat: items.reduce((total, item) => total + toSafeNumber(item.fat), 0),
    };
  };

  const historyRows = historyDateKeys.map(makeHistoryRow);
  const previousHistoryRows = historyDateKeys.map((dateKey) =>
    makeHistoryRow(moveDate(dateKey, -historyPeriodDays))
  );

  // Dashboard 2.0: fast weekly insight independent of the history filter.
  const dashboardWeekRows = Array.from({ length: 7 }, (_, index) =>
    makeHistoryRow(moveDate(selectedDate, -(6 - index)))
  );
  const dashboardRegisteredDays = dashboardWeekRows.filter((day) => day.calories > 0);
  const dashboardWeekAverage = dashboardRegisteredDays.length
    ? Math.round(
        dashboardRegisteredDays.reduce((sum, day) => sum + day.calories, 0) /
          dashboardRegisteredDays.length
      )
    : 0;
  const dashboardDaysNearGoal = dashboardWeekRows.filter(
    (day) =>
      day.calories > 0 &&
      calorieGoal > 0 &&
      Math.abs(day.calories - calorieGoal) <= calorieGoal * 0.1
  ).length;
  const dashboardBestProtein = dashboardWeekRows.reduce(
    (best, day) => Math.max(best, day.protein),
    0
  );
  const dashboardChartMax = Math.max(1, calorieGoal, ...dashboardWeekRows.map((day) => day.calories));
  const latestLoggedItems = Object.keys(diaries)
    .sort((a, b) => b.localeCompare(a))
    .flatMap((dateKey) =>
      (diaries[dateKey] ?? []).map((item) => ({ ...item, dateKey }))
    )
    .slice(0, 3);

  const historyCalories = historyRows.reduce((total, day) => total + day.calories, 0);
  const historyProtein = historyRows.reduce((total, day) => total + day.protein, 0);
  const historyCarbs = historyRows.reduce((total, day) => total + day.carbs, 0);
  const historyFat = historyRows.reduce((total, day) => total + day.fat, 0);
  const daysWithFood = historyRows.filter((day) => day.calories > 0).length;
  const previousDaysWithFood = previousHistoryRows.filter((day) => day.calories > 0).length;

  const averageCalories = daysWithFood > 0 ? Math.round(historyCalories / daysWithFood) : 0;
  const previousAverageCalories =
    previousDaysWithFood > 0
      ? Math.round(
          previousHistoryRows.reduce((total, day) => total + day.calories, 0) /
            previousDaysWithFood
        )
      : 0;
  const averageProtein =
    daysWithFood > 0 ? Math.round((historyProtein / daysWithFood) * 10) / 10 : 0;
  const averageCarbs =
    daysWithFood > 0 ? Math.round((historyCarbs / daysWithFood) * 10) / 10 : 0;
  const averageFat =
    daysWithFood > 0 ? Math.round((historyFat / daysWithFood) * 10) / 10 : 0;

  const daysOnGoal = historyRows.filter(
    (day) =>
      day.calories > 0 &&
      calorieGoal > 0 &&
      Math.abs(day.calories - calorieGoal) <= calorieGoal * 0.1
  ).length;
  const calorieDifference = averageCalories - previousAverageCalories;

  const historyMacroCalories = historyProtein * 4 + historyCarbs * 4 + historyFat * 9;
  const proteinShare =
    historyMacroCalories > 0
      ? Math.round(((historyProtein * 4) / historyMacroCalories) * 100)
      : 0;
  const carbsShare =
    historyMacroCalories > 0
      ? Math.round(((historyCarbs * 4) / historyMacroCalories) * 100)
      : 0;
  const fatShare = Math.max(0, 100 - proteinShare - carbsShare);
  const weeklyGoalProgress =
    calorieGoal > 0 && daysWithFood > 0
      ? Math.min(100, Math.round((averageCalories / calorieGoal) * 100))
      : 0;

  const chartBucketCount = historyPeriodDays === 7 ? 7 : 10;
  const chartBucketSize = Math.ceil(historyRows.length / chartBucketCount);
  const weeklyRows = Array.from(
    { length: Math.ceil(historyRows.length / chartBucketSize) },
    (_, bucketIndex) => {
      const bucket = historyRows.slice(
        bucketIndex * chartBucketSize,
        (bucketIndex + 1) * chartBucketSize
      );
      const registered = bucket.filter((day) => day.calories > 0);
      const bucketCalories = registered.length
        ? Math.round(
            registered.reduce((total, day) => total + day.calories, 0) /
              registered.length
          )
        : 0;
      return {
        dateKey: bucket[bucket.length - 1]?.dateKey ?? selectedDate,
        calories: bucketCalories,
        protein: 0,
        carbs: 0,
        fat: 0,
      };
    }
  );


  // v7.1 – Avansert statistikk
  const selectedDateObject = new Date(`${selectedDate}T12:00:00`);
  const selectedMonthStart = new Date(
    selectedDateObject.getFullYear(),
    selectedDateObject.getMonth(),
    1,
    12
  );
  const selectedMonthDays = new Date(
    selectedDateObject.getFullYear(),
    selectedDateObject.getMonth() + 1,
    0
  ).getDate();
  const selectedMonthOffset = (selectedMonthStart.getDay() + 6) % 7;
  const monthCalendarCells = [
    ...Array.from({ length: selectedMonthOffset }, () => null),
    ...Array.from({ length: selectedMonthDays }, (_, index) => {
      const date = new Date(
        selectedDateObject.getFullYear(),
        selectedDateObject.getMonth(),
        index + 1,
        12
      );
      const dateKey = getDateKey(date);
      return makeHistoryRow(dateKey);
    }),
  ];
  const monthRegisteredRows = monthCalendarCells.filter(
    (row): row is ReturnType<typeof makeHistoryRow> => Boolean(row && row.calories > 0)
  );
  const monthAverageCalories = monthRegisteredRows.length
    ? Math.round(
        monthRegisteredRows.reduce((sum, row) => sum + row.calories, 0) /
          monthRegisteredRows.length
      )
    : 0;
  const monthGoalDays = monthRegisteredRows.filter(
    (row) => calorieGoal > 0 && Math.abs(row.calories - calorieGoal) <= calorieGoal * 0.1
  ).length;

  const macroTrendBucketCount = Math.min(7, Math.max(1, historyRows.length));
  const macroTrendBucketSize = Math.ceil(historyRows.length / macroTrendBucketCount);
  const macroTrendRows = Array.from({ length: macroTrendBucketCount }, (_, bucketIndex) => {
    const bucket = historyRows.slice(
      bucketIndex * macroTrendBucketSize,
      (bucketIndex + 1) * macroTrendBucketSize
    );
    const registered = bucket.filter((row) => row.calories > 0);
    const divisor = Math.max(1, registered.length);
    return {
      label: formatShortDate(bucket[bucket.length - 1]?.dateKey ?? selectedDate),
      protein: registered.reduce((sum, row) => sum + row.protein, 0) / divisor,
      carbs: registered.reduce((sum, row) => sum + row.carbs, 0) / divisor,
      fat: registered.reduce((sum, row) => sum + row.fat, 0) / divisor,
    };
  });
  const macroTrendMax = Math.max(
    1,
    ...macroTrendRows.flatMap((row) => [row.protein, row.carbs, row.fat])
  );

  const saveEditedItem = () => {
    if (!editingItem) {
      return;
    }

    const amount = Number(editAmount.replace(",", "."));

    if (Number.isNaN(amount) || amount <= 0 || amount > 5000) {
      Alert.alert(
        "Ugyldig mengde",
        "Skriv inn en mengde mellom 1 og 5000 gram."
      );
      return;
    }

    const originalAmount = editingItem.amountGrams ?? 100;
    const factor = amount / originalAmount;

    updateDiary((currentDiary) =>
      currentDiary.map((item) =>
        item.diaryId === editingItem.diaryId
          ? {
              ...item,
              amountGrams: amount,
              meal: editMeal,
              name: item.name.replace(
                /–\s*\d+(?:[.,]\d+)?\s*g$/,
                `– ${amount} g`
              ),
              calories: Math.round(
                toSafeNumber(item.calories) * factor
              ),
              protein:
                Math.round(
                  toSafeNumber(item.protein) * factor * 10
                ) / 10,
              carbs:
                Math.round(
                  toSafeNumber(item.carbs) * factor * 10
                ) / 10,
              fat:
                Math.round(
                  toSafeNumber(item.fat) * factor * 10
                ) / 10,
            }
          : item
      )
    );

    setEditingItem(null);
  };

  const deleteEditedItem = () => {
    if (!editingItem) return;

    const diaryId = editingItem.diaryId;

    confirmDestructiveAction(
      "Slett matvare",
      "Vil du slette denne registreringen?",
      () => {
        updateDiary((currentDiary) =>
          currentDiary.filter((item) => item.diaryId !== diaryId)
        );
        setEditingItem(null);
        showToast("Matvaren ble slettet");
      }
    );
  };





  const openMealTemplateCreator = () => {
    setTemplateName("");
    setTemplateMeal(selectedMeal);
    setTemplateItems([]);
    setTemplateFoodSearch("");
    setTemplateAmount("100");
    setSelectedTemplateFood(null);
    setTemplateOpen(true);
  };

  const templateSearchResults = allFoods
    .filter((food) =>
      food.name
        .toLowerCase()
        .includes(templateFoodSearch.trim().toLowerCase())
    )
    .slice(0, 8);

  const addItemToTemplate = () => {
    if (!selectedTemplateFood) {
      Alert.alert("Velg matvare", "Velg en matvare først.");
      return;
    }

    const amount = Number(templateAmount.replace(",", "."));

    if (Number.isNaN(amount) || amount <= 0 || amount > 5000) {
      Alert.alert(
        "Ugyldig mengde",
        "Skriv inn en mengde mellom 1 og 5000 gram."
      );
      return;
    }

    setTemplateItems((current) => [
      ...current,
      {
        id: `template-item-${Date.now()}`,
        food: selectedTemplateFood,
        amountGrams: amount,
      },
    ]);

    setSelectedTemplateFood(null);
    setTemplateFoodSearch("");
    setTemplateAmount("100");
  };

  const removeTemplateItem = (itemId: string) => {
    setTemplateItems((current) =>
      current.filter((item) => item.id !== itemId)
    );
  };

  const saveMealTemplate = () => {
    if (!templateName.trim()) {
      Alert.alert("Mangler navn", "Skriv inn navn på måltidsmalen.");
      return;
    }

    if (templateItems.length === 0) {
      Alert.alert(
        "Ingen matvarer",
        "Legg til minst én matvare i måltidsmalen."
      );
      return;
    }

    const template: MealTemplate = {
      id: `template-${Date.now()}`,
      name: templateName.trim(),
      meal: templateMeal,
      items: templateItems,
    };

    setMealTemplates((current) => [template, ...current]);
    setTemplateOpen(false);
  };

  const addMealTemplateToDiary = (template: MealTemplate) => {
    const diaryItems: DiaryItem[] = template.items.map((item) => {
      const factor = item.amountGrams / 100;

      return {
        id: item.food.id,
        diaryId: `${template.id}-${item.id}-${Date.now()}-${Math.random()}`,
        name: item.food.name,
        calories: Math.round(
          toSafeNumber(item.food.calories) * factor
        ),
        protein:
          Math.round(
            toSafeNumber(item.food.protein) * factor * 10
          ) / 10,
        carbs:
          Math.round(
            toSafeNumber(item.food.carbs) * factor * 10
          ) / 10,
        fat:
          Math.round(toSafeNumber(item.food.fat) * factor * 10) /
          10,
        meal: template.meal,
        amountGrams: item.amountGrams,
      };
    });

    updateDiary((current) => [...current, ...diaryItems]);

    Alert.alert(
      "Måltid lagt til",
      `${template.name} ble lagt til under ${template.meal}.`
    );
  };

  const deleteMealTemplate = (templateId: string) => {
    Alert.alert(
      "Slett måltidsmal",
      "Vil du slette denne måltidsmalen?",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Slett",
          style: "destructive",
          onPress: () =>
            setMealTemplates((current) =>
              current.filter(
                (template) => template.id !== templateId
              )
            ),
        },
      ]
    );
  };

  const openRecipeCreator = () => {
    setEditingRecipeId(null);
    setRecipeName("");
    setRecipeServings("2");
    setRecipeIngredients([]);
    setRecipeFoodSearch("");
    setRecipeAmount("100");
    setSelectedRecipeFood(null);
    setRecipeOpen(true);
  };

  const openRecipeEditor = (recipe: Recipe) => {
    setEditingRecipeId(recipe.id);
    setRecipeName(recipe.name);
    setRecipeServings(String(recipe.servings));
    setRecipeIngredients(
      recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        food: { ...ingredient.food },
      }))
    );
    setRecipeFoodSearch("");
    setRecipeAmount("100");
    setSelectedRecipeFood(null);
    setRecipeOpen(true);
  };

  const closeRecipeModal = () => {
    setRecipeOpen(false);
    setEditingRecipeId(null);
    setSelectedRecipeFood(null);
    setRecipeFoodSearch("");
  };

  const recipeSearchResults = allFoods
    .filter((food) =>
      food.name
        .toLowerCase()
        .includes(recipeFoodSearch.trim().toLowerCase())
    )
    .slice(0, 8);

  const addIngredientToRecipe = () => {
    if (!selectedRecipeFood) {
      Alert.alert("Velg matvare", "Velg en matvare først.");
      return;
    }

    const amount = Number(recipeAmount.replace(",", "."));

    if (Number.isNaN(amount) || amount <= 0 || amount > 5000) {
      Alert.alert(
        "Ugyldig mengde",
        "Skriv inn en mengde mellom 1 og 5000 gram."
      );
      return;
    }

    setRecipeIngredients((current) => [
      ...current,
      {
        id: `ingredient-${Date.now()}`,
        food: selectedRecipeFood,
        amountGrams: amount,
      },
    ]);

    setSelectedRecipeFood(null);
    setRecipeFoodSearch("");
    setRecipeAmount("100");
  };

  const removeRecipeIngredient = (ingredientId: string) => {
    setRecipeIngredients((current) =>
      current.filter((ingredient) => ingredient.id !== ingredientId)
    );
  };

  const getRecipeTotals = (ingredients: RecipeIngredient[]) =>
    ingredients.reduce(
      (totals, ingredient) => {
        const factor = ingredient.amountGrams / 100;

        return {
          calories:
            totals.calories +
            toSafeNumber(ingredient.food.calories) * factor,
          protein:
            totals.protein +
            toSafeNumber(ingredient.food.protein) * factor,
          carbs:
            totals.carbs +
            toSafeNumber(ingredient.food.carbs) * factor,
          fat:
            totals.fat +
            toSafeNumber(ingredient.food.fat) * factor,
        };
      },
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      }
    );

  const saveRecipe = () => {
    const servings = Number(recipeServings.replace(",", "."));

    if (!recipeName.trim()) {
      Alert.alert("Mangler navn", "Skriv inn navn på oppskriften.");
      return;
    }

    if (
      Number.isNaN(servings) ||
      servings < 1 ||
      servings > 50
    ) {
      Alert.alert(
        "Ugyldig antall porsjoner",
        "Skriv inn mellom 1 og 50 porsjoner."
      );
      return;
    }

    if (recipeIngredients.length === 0) {
      Alert.alert(
        "Ingen ingredienser",
        "Legg til minst én ingrediens."
      );
      return;
    }

    const recipe: Recipe = {
      id: editingRecipeId ?? `recipe-${Date.now()}`,
      name: recipeName.trim(),
      servings,
      ingredients: recipeIngredients,
    };

    setRecipes((current) =>
      editingRecipeId
        ? current.map((item) =>
            item.id === editingRecipeId ? recipe : item
          )
        : [recipe, ...current]
    );

    closeRecipeModal();
  };

  const addRecipePortion = (recipe: Recipe, portions = 1) => {
    const totals = getRecipeTotals(recipe.ingredients);
    const servings = Math.max(1, recipe.servings);
    const safePortions = Math.max(0.5, portions);

    const diaryItem: DiaryItem = {
      id: recipe.id,
      diaryId: `${recipe.id}-${Date.now()}`,
      name: `${recipe.name} – ${safePortions} porsjon${safePortions === 1 ? "" : "er"}`,
      calories: Math.round((totals.calories / servings) * safePortions),
      protein:
        Math.round(((totals.protein / servings) * safePortions) * 10) / 10,
      carbs:
        Math.round(((totals.carbs / servings) * safePortions) * 10) / 10,
      fat:
        Math.round(((totals.fat / servings) * safePortions) * 10) / 10,
      meal: selectedMeal,
    };

    updateDiary((current) => [...current, diaryItem]);
    Alert.alert("Lagt til", `${recipe.name} ble lagt til under ${selectedMeal}.`);
  };

  const chooseRecipePortion = (recipe: Recipe) => {
    Alert.alert(
      recipe.name,
      `Velg porsjon som skal legges til under ${selectedMeal}.`,
      [
        { text: "½ porsjon", onPress: () => addRecipePortion(recipe, 0.5) },
        { text: "1 porsjon", onPress: () => addRecipePortion(recipe, 1) },
        { text: "2 porsjoner", onPress: () => addRecipePortion(recipe, 2) },
        { text: "Avbryt", style: "cancel" },
      ]
    );
  };

  const duplicateRecipe = (recipe: Recipe) => {
    const copy: Recipe = {
      ...recipe,
      id: `recipe-${Date.now()}`,
      name: `${recipe.name} (kopi)`,
      ingredients: recipe.ingredients.map((ingredient, index) => ({
        ...ingredient,
        id: `ingredient-${Date.now()}-${index}`,
        food: { ...ingredient.food },
      })),
    };
    setRecipes((current) => [copy, ...current]);
  };

  const deleteRecipe = (recipeId: string) => {
    Alert.alert(
      "Slett oppskrift",
      "Vil du slette denne oppskriften?",
      [
        {
          text: "Avbryt",
          style: "cancel",
        },
        {
          text: "Slett",
          style: "destructive",
          onPress: () =>
            setRecipes((current) =>
              current.filter((recipe) => recipe.id !== recipeId)
            ),
        },
      ]
    );
  };



  const generateAutomaticMacroGoals = () => {
    Keyboard.dismiss();

    const calories = Math.max(0, calorieGoal);
    const profileWeight = toSafeNumber(profile.weightKg);
    const latestRegisteredWeight =
      latestWeight !== null ? latestWeight : profileWeight;
    const weightForCalculation =
      latestRegisteredWeight > 0 ? latestRegisteredWeight : 70;

    if (calories < 1000 || calories > 6000) {
      Alert.alert(
        "Kalorimål mangler",
        "Sett et kalorimål mellom 1000 og 6000 kcal først."
      );
      return;
    }

    let proteinPerKg = 1.6;

    if (profile.goal === "Gå ned") {
      proteinPerKg = 1.8;
    } else if (profile.goal === "Gå opp") {
      proteinPerKg = 1.7;
    }

    let suggestedProtein = Math.round(
      weightForCalculation * proteinPerKg
    );

    const minimumFat = Math.round(weightForCalculation * 0.8);
    let suggestedFat = Math.max(
      minimumFat,
      Math.round((calories * 0.25) / 9)
    );

    const caloriesUsedByProtein = suggestedProtein * 4;
    const caloriesUsedByFat = suggestedFat * 9;
    let remainingCalories =
      calories - caloriesUsedByProtein - caloriesUsedByFat;

    if (remainingCalories < 0) {
      suggestedFat = Math.max(
        Math.round(weightForCalculation * 0.6),
        40
      );
      remainingCalories =
        calories - suggestedProtein * 4 - suggestedFat * 9;
    }

    let suggestedCarbs = Math.max(
      0,
      Math.round(remainingCalories / 4)
    );

    if (suggestedCarbs < 50) {
      suggestedCarbs = 50;

      const allowedFatCalories =
        calories - suggestedProtein * 4 - suggestedCarbs * 4;

      suggestedFat = Math.max(
        30,
        Math.round(allowedFatCalories / 9)
      );
    }

    setProteinGoalInput(String(suggestedProtein));
    setCarbsGoalInput(String(suggestedCarbs));
    setFatGoalInput(String(suggestedFat));

    setMacroSuggestionText(
      `Forslag basert på ${Math.round(
        weightForCalculation
      )} kg, ${calories} kcal og målet «${profile.goal}».`
    );
  };

  const openMacroGoalEditor = () => {
    setProteinGoalInput(profile.proteinGoal || "120");
    setCarbsGoalInput(profile.carbsGoal || "250");
    setFatGoalInput(profile.fatGoal || "70");
    setMacroSuggestionText("");
    setMacroGoalOpen(true);
  };

  const saveMacroGoals = () => {
    Keyboard.dismiss();

    const protein = Number(proteinGoalInput.replace(",", "."));
    const carbs = Number(carbsGoalInput.replace(",", "."));
    const fat = Number(fatGoalInput.replace(",", "."));

    if (
      [protein, carbs, fat].some(
        (value) =>
          Number.isNaN(value) || value < 0 || value > 1000
      )
    ) {
      Alert.alert(
        "Ugyldige mål",
        "Skriv inn verdier mellom 0 og 1000 gram."
      );
      return;
    }

    const nextProteinGoal = String(Math.round(protein));
    const nextCarbsGoal = String(Math.round(carbs));
    const nextFatGoal = String(Math.round(fat));

    // 1 g protein = 4 kcal, 1 g karbohydrat = 4 kcal,
    // og 1 g fett = 9 kcal. Kalorimålet skal derfor alltid
    // følge de lagrede makromålene.
    const nextCalorieGoal = Math.round(
      protein * 4 + carbs * 4 + fat * 9
    );

    setProfile((current) => ({
      ...current,
      proteinGoal: nextProteinGoal,
      carbsGoal: nextCarbsGoal,
      fatGoal: nextFatGoal,
    }));
    setCalorieGoal(nextCalorieGoal);

    setProteinGoalInput(nextProteinGoal);
    setCarbsGoalInput(nextCarbsGoal);
    setFatGoalInput(nextFatGoal);
    setMacroGoalOpen(false);
    showToast(`Makromål og kalorimål oppdatert til ${nextCalorieGoal} kcal`);
  };

  const saveProfileChanges = () => {
    Keyboard.dismiss();

    const age = Number(profile.age.replace(",", "."));
    const height = Number(profile.heightCm.replace(",", "."));
    const weight = Number(profile.weightKg.replace(",", "."));

    if (!Number.isFinite(age) || age < 13 || age > 120) {
      Alert.alert("Ugyldig alder", "Skriv inn en alder mellom 13 og 120 år.");
      return;
    }

    if (!Number.isFinite(height) || height < 100 || height > 250) {
      Alert.alert("Ugyldig høyde", "Skriv inn en høyde mellom 100 og 250 cm.");
      return;
    }

    if (!Number.isFinite(weight) || weight < 30 || weight > 350) {
      Alert.alert("Ugyldig vekt", "Skriv inn en vekt mellom 30 og 350 kg.");
      return;
    }

    setProfile((current) => ({
      ...current,
      age: String(Math.round(age)),
      heightCm: String(Math.round(height * 10) / 10),
      weightKg: String(Math.round(weight * 10) / 10),
    }));
    setProfileOpen(false);
    showToast("Kroppsdataene ble lagret");
  };

  const saveTargetWeight = () => {
    Keyboard.dismiss();

    const parsedTarget = Number(
      targetWeightInput.replace(",", ".")
    );

    if (
      Number.isNaN(parsedTarget) ||
      parsedTarget < 30 ||
      parsedTarget > 350
    ) {
      Alert.alert(
        "Ugyldig målvekt",
        "Skriv inn en målvekt mellom 30 og 350 kg."
      );
      return;
    }

    const rounded = Math.round(parsedTarget * 10) / 10;

    setProfile((current) => ({
      ...current,
      targetWeightKg: String(rounded),
    }));

    setTargetWeightInput("");
    setWeightOpen(false);
  };

  const saveWeightEntry = () => {
    Keyboard.dismiss();

    const parsedWeight = Number(weightInput.replace(",", "."));

    if (
      Number.isNaN(parsedWeight) ||
      parsedWeight < 30 ||
      parsedWeight > 350
    ) {
      Alert.alert(
        "Ugyldig vekt",
        "Skriv inn en vekt mellom 30 og 350 kg."
      );
      return;
    }

    const entryDate = selectedDate;
    const roundedWeight = Math.round(parsedWeight * 10) / 10;

    setWeightEntries((current) => {
      const existingForDate = current.some(
        (entry) => entry.date === entryDate
      );

      const next = existingForDate
        ? current.map((entry) =>
            entry.date === entryDate
              ? {
                  ...entry,
                  weightKg: roundedWeight,
                }
              : entry
          )
        : [
            ...current,
            {
              id: `weight-${entryDate}-${Date.now()}`,
              date: entryDate,
              weightKg: roundedWeight,
            },
          ];

      const sorted = next.sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      const newestEntry = sorted[sorted.length - 1];

      if (newestEntry) {
        setProfile((currentProfile) => ({
          ...currentProfile,
          weightKg: String(newestEntry.weightKg),
        }));
      }

      return sorted;
    });

    setWeightInput("");
    setWeightOpen(false);
  };

  const deleteWeightEntry = (id: string) => {
    Alert.alert(
      "Slett vektregistrering",
      "Vil du slette denne målingen?",
      [
        {
          text: "Avbryt",
          style: "cancel",
        },
        {
          text: "Slett",
          style: "destructive",
          onPress: () =>
            setWeightEntries((current) =>
              current.filter((entry) => entry.id !== id)
            ),
        },
      ]
    );
  };

  const latestWeight =
    weightEntries.length > 0
      ? weightEntries[weightEntries.length - 1].weightKg
      : null;

  const firstWeight =
    weightEntries.length > 0 ? weightEntries[0].weightKg : null;

  const weightChange =
    latestWeight !== null && firstWeight !== null
      ? Math.round((latestWeight - firstWeight) * 10) / 10
      : 0;

  const targetWeight = toSafeNumber(profile.targetWeightKg);

  const remainingToTarget =
    latestWeight !== null && targetWeight > 0
      ? Math.round((targetWeight - latestWeight) * 10) / 10
      : null;

  const progressToTarget =
    latestWeight !== null &&
    firstWeight !== null &&
    targetWeight > 0 &&
    firstWeight !== targetWeight
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((firstWeight - latestWeight) /
                (firstWeight - targetWeight)) *
                100
            )
          )
        )
      : 0;

  const displayName =
    profile.name.trim() || accountName.trim() || accountEmail.split("@")[0] || "venn";

  const currentHour = new Date().getHours();
  const greeting =
    currentHour >= 5 && currentHour < 12
      ? "God morgen"
      : currentHour >= 12 && currentHour < 17
        ? "God ettermiddag"
        : currentHour >= 17 && currentHour < 23
          ? "God kveld"
          : "God natt";

  const todayKey = getDateKey(new Date());
  let currentStreak = 0;
  let streakDate = new Date();
  while (currentStreak < 3650) {
    const key = getDateKey(streakDate);
    if ((diaries[key] ?? []).length === 0) break;
    currentStreak += 1;
    streakDate.setDate(streakDate.getDate() - 1);
  }

  const calorieAccuracy = calorieGoal > 0
    ? Math.max(0, 100 - Math.min(100, Math.abs(caloriesEaten - calorieGoal) / calorieGoal * 100))
    : 0;
  const proteinScore = proteinGoal > 0 ? Math.min(100, proteinEaten / proteinGoal * 100) : 0;
  const macroBalanceScore = (proteinScore + Math.min(100, carbsProgress) + Math.min(100, fatProgress)) / 3;
  const dailyScore = Math.round(calorieAccuracy * 0.6 + macroBalanceScore * 0.4);

  const graphEntries = weightEntries.slice(-12);

  const graphWeights = graphEntries.map((entry) => entry.weightKg);

  const minGraphWeight =
    graphWeights.length > 0 ? Math.min(...graphWeights) : 0;

  const maxGraphWeight =
    graphWeights.length > 0 ? Math.max(...graphWeights) : 0;

  const graphRange = Math.max(maxGraphWeight - minGraphWeight, 1);

  const getWeightBarHeight = (weightKg: number) => {
    const normalized = (weightKg - minGraphWeight) / graphRange;
    return 36 + normalized * 104;
  };

  const activityFactors: Record<Profile["activity"], number> = {
    "Lite aktiv": 1.2,
    "Lett aktiv": 1.375,
    "Moderat aktiv": 1.55,
    "Veldig aktiv": 1.725,
  };

  const calculateSuggestedCalories = () => {
    const age = Number(profile.age.replace(",", "."));
    const height = Number(profile.heightCm.replace(",", "."));
    const weight = Number(profile.weightKg.replace(",", "."));

    if (
      Number.isNaN(age) ||
      age < 15 ||
      age > 100 ||
      Number.isNaN(height) ||
      height < 120 ||
      height > 230 ||
      Number.isNaN(weight) ||
      weight < 35 ||
      weight > 300
    ) {
      Alert.alert(
        "Ugyldige opplysninger",
        "Kontroller alder, høyde og vekt."
      );
      return;
    }

    const sexAdjustment = profile.sex === "Mann" ? 5 : -161;
    const bmr =
      10 * weight + 6.25 * height - 5 * age + sexAdjustment;

    let suggested = bmr * activityFactors[profile.activity];

    if (profile.goal === "Gå ned") {
      suggested -= 400;
    } else if (profile.goal === "Gå opp") {
      suggested += 300;
    }

    suggested = Math.max(1200, Math.round(suggested / 10) * 10);

    setCalorieGoal(suggested);
    setGoalInput(String(suggested));
    setProfileOpen(false);

    Alert.alert(
      "Kalorimål beregnet",
      `Forslaget er ${suggested} kcal per dag. Dette er et estimat.`
    );
  };

  const deleteAccount = () => {
    Alert.alert(
      "Slett konto",
      "Dette sletter kontoen, matdagboken, historikken og egne varer permanent.",
      [
        {
          text: "Avbryt",
          style: "cancel",
        },
        {
          text: "Fortsett",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Er du helt sikker?",
              "Denne handlingen kan ikke angres.",
              [
                {
                  text: "Avbryt",
                  style: "cancel",
                },
                {
                  text: "Slett permanent",
                  style: "destructive",
                  onPress: confirmDeleteAccount,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    try {
      setSyncStatus("saving");

      const { error } = await supabase.functions.invoke(
        "delete-account",
        {
          body: {},
        }
      );

      if (error) {
        throw error;
      }

      await AsyncStorage.multiRemove([
        DIARY_STORAGE_KEY,
        OLD_DIARY_STORAGE_KEY,
        CUSTOM_FOODS_STORAGE_KEY,
        GOAL_STORAGE_KEY,
      ]);

      await supabase.auth.signOut();

      Alert.alert(
        "Konto slettet",
        "Kontoen og dataene dine er slettet."
      );
    } catch (error) {
      console.error(error);
      setSyncStatus("error");

      Alert.alert(
        "Kunne ikke slette kontoen",
        error instanceof Error
          ? error.message
          : "Prøv igjen senere."
      );
    }
  };

  const changeTab = (tab: "Oversikt" | "Legg til" | "Historikk" | "Profil") => {
    if (tab === activeTab) return;
    Keyboard.dismiss();
    setActiveTab(tab);
  };

  useEffect(() => {
    screenFade.setValue(0);
    Animated.timing(screenFade, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [activeTab, screenFade]);

  useEffect(() => {
    const progress = Math.min(1, Math.max(0, caloriesEaten / Math.max(1, calorieGoal)));
    Animated.parallel([
      Animated.timing(calorieRingProgress, {
        toValue: progress,
        duration: 850,
        useNativeDriver: false,
      }),
      Animated.timing(dashboardFade, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [caloriesEaten, calorieGoal, calorieRingProgress, dashboardFade]);

  return (
    <SafeAreaView style={[styles.container, styles.premiumPage]}>
      <StatusBar style="light" />

      <Animated.FlatList
        style={{
          opacity: screenFade,
          transform: [
            {
              translateY: screenFade.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
            {
              scale: screenFade.interpolate({
                inputRange: [0, 1],
                outputRange: [0.992, 1],
              }),
            },
          ],
        }}
        data={activeTab === "Legg til" ? filteredFoods : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        ListHeaderComponent={
          <>
            {false && (
              <>
            <View style={styles.topRow}>
              <View style={styles.titleArea}>
                <Text style={styles.eyebrow}>DAGENS OVERSIKT</Text>
                <Text style={styles.title}>Matdagbok</Text>
                <Text
                  style={[
                    styles.syncText,
                    syncStatus === "error" && styles.syncTextError,
                  ]}
                >
                  {syncStatus === "loading"
                    ? "Henter data …"
                    : syncStatus === "saving"
                      ? "Lagrer …"
                      : syncStatus === "error"
                        ? "Ikke synkronisert"
                        : "Synkronisert"}
                </Text>
              </View>

              <Pressable style={styles.logoutButton} onPress={onSignOut}>
                <Text style={styles.logoutButtonText}>Logg ut</Text>
              </Pressable>
            </View>

            <View style={styles.dateCard}>
              <Pressable
                style={styles.dateArrow}
                onPress={() =>
                  setSelectedDate((date) => moveDate(date, -1))
                }
              >
                <Text style={styles.dateArrowText}>‹</Text>
              </Pressable>

              <View style={styles.dateCenter}>
                <Text style={styles.dateText}>
                  {formatDate(selectedDate)}
                </Text>

                {selectedDate !== getDateKey(new Date()) && (
                  <Pressable
                    onPress={() =>
                      setSelectedDate(getDateKey(new Date()))
                    }
                  >
                    <Text style={styles.todayText}>Gå til i dag</Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                style={styles.dateArrow}
                onPress={() =>
                  setSelectedDate((date) => moveDate(date, 1))
                }
              >
                <Text style={styles.dateArrowText}>›</Text>
              </Pressable>
            </View>

              </>
            )}

            {activeTab === "Oversikt" && (
              <Animated.View style={[styles.premiumDashboard, { opacity: dashboardFade, transform: [{ translateY: dashboardFade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
                <View style={styles.premiumHeader}>
                  <View style={styles.premiumAvatar}>
                    <Text style={styles.premiumAvatarText}>
                      {displayName.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.premiumHeaderText}>
                    <Text style={styles.premiumGreeting}>
                      {greeting}, {displayName}! 👋
                    </Text>
                    <Text style={styles.premiumDate}>{formatDate(selectedDate)}</Text>
                    <Text
                      style={[
                        styles.premiumSync,
                        syncStatus === "error" && styles.premiumSyncError,
                      ]}
                    >
                      {syncStatus === "loading"
                        ? "Henter data …"
                        : syncStatus === "saving"
                          ? "Lagrer …"
                          : syncStatus === "error"
                            ? "Ikke synkronisert"
                            : "● Synkronisert"}
                    </Text>
                  </View>
                  <Pressable style={styles.premiumProfileButton} onPress={() => setActiveTab("Profil")}>
                    <Text style={styles.premiumProfileIcon}>⚙️</Text>
                  </Pressable>
                </View>

                <View style={styles.premiumDateNavigator}>
                  <Pressable onPress={() => setSelectedDate((date) => moveDate(date, -1))}>
                    <Text style={styles.premiumDateArrow}>‹</Text>
                  </Pressable>
                  <Pressable onPress={() => setSelectedDate(todayKey)}>
                    <Text style={styles.premiumTodayText}>📅 {selectedDate === todayKey ? "I dag" : "Gå til i dag"}</Text>
                  </Pressable>
                  <Pressable onPress={() => setSelectedDate((date) => moveDate(date, 1))}>
                    <Text style={styles.premiumDateArrow}>›</Text>
                  </Pressable>
                </View>

                <View style={styles.premiumSummaryCard}>
                  <Text style={styles.premiumCardTitle}>Sammendrag i dag</Text>
                  <View style={styles.premiumSummaryMain}>
                    <View style={styles.premiumRingWrap}>
                      <Svg width={188} height={188}>
                        <Circle cx={94} cy={94} r={76} stroke="#263044" strokeWidth={15} fill="transparent" />
                        <AnimatedCircle
                          cx={94}
                          cy={94}
                          r={76}
                          stroke={themes[appTheme].primary}
                          strokeWidth={15}
                          fill="transparent"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 76} ${2 * Math.PI * 76}`}
                          strokeDashoffset={calorieRingProgress.interpolate({ inputRange: [0, 1], outputRange: [2 * Math.PI * 76, 0] })}
                          rotation="-90"
                          origin="94, 94"
                        />
                      </Svg>
                      <View style={styles.premiumRingCenter}>
                        <Text style={styles.premiumRingLabel}>Kalorier igjen</Text>
                        <Text style={styles.premiumRingValue}>{Math.max(0, Math.round(caloriesRemaining))}</Text>
                        <Text style={styles.premiumRingGoal}>av {Math.round(calorieGoal)} kcal</Text>
                      </View>
                    </View>

                    <View style={styles.premiumCaloriesPanel}>
                      <Text style={styles.premiumCaloriesLabel}>Spist</Text>
                      <Text style={styles.premiumCaloriesValue}>{Math.round(caloriesEaten)}</Text>
                      <Text style={styles.premiumCaloriesUnit}>kcal</Text>
                      <View style={styles.premiumOverallTrack}>
                        <View style={[styles.premiumOverallFill, { width: `${Math.min(100, Math.max(0, caloriesEaten / Math.max(1, calorieGoal) * 100))}%` }]} />
                      </View>
                      <Text style={styles.premiumPercentText}>
                        {Math.round(Math.min(100, Math.max(0, caloriesEaten / Math.max(1, calorieGoal) * 100)))} % av dagsmålet
                      </Text>
                    </View>
                  </View>

                  <View style={styles.premiumMacroGrid}>
                    {[
                      { icon: "💪", label: "Protein", value: proteinEaten, goal: proteinGoal, progress: proteinProgress, color: "#8B6CFF", tint: "#251F45" },
                      { icon: "🌾", label: "Karbohyd.", value: carbsEaten, goal: carbsGoal, progress: carbsProgress, color: "#F2B84B", tint: "#3A2D19" },
                      { icon: "🥑", label: "Fett", value: fatEaten, goal: fatGoal, progress: fatProgress, color: "#3EDB91", tint: "#17372D" },
                    ].map((macro) => (
                      <Pressable
                        key={macro.label}
                        style={[styles.premiumMacroItem, { backgroundColor: macro.tint }]}
                        onPress={openMacroGoalEditor}
                      >
                        <View style={[styles.premiumMacroIconBubble, { backgroundColor: `${macro.color}26` }]}>
                          <Text style={styles.premiumMacroIcon}>{macro.icon}</Text>
                        </View>
                        <Text style={styles.premiumMacroLabel}>{macro.label}</Text>
                        <Text style={styles.premiumMacroValue}>{Math.round(macro.value)} g</Text>
                        <View style={styles.premiumMacroTrack}>
                          <View style={[styles.premiumMacroFill, { width: `${Math.min(100, macro.progress)}%`, backgroundColor: macro.color }]} />
                        </View>
                        <Text style={styles.premiumMacroGoal}>av {Math.round(macro.goal)} g</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <Pressable
                  style={styles.premiumQuickAdd}
                  onPress={() => setActiveTab("Legg til")}
                >
                  <View style={styles.premiumQuickAddIcon}>
                    <Text style={styles.premiumQuickAddPlus}>+</Text>
                  </View>
                  <View style={styles.premiumQuickAddTextWrap}>
                    <Text style={styles.premiumQuickAddTitle}>Legg til mat</Text>
                    <Text style={styles.premiumQuickAddSubtitle}>Søk, skann strekkode eller bruk favoritter</Text>
                  </View>
                  <Text style={styles.premiumQuickAddArrow}>›</Text>
                </Pressable>

                <View style={styles.dashboardWeekCard}>
                  <View style={styles.dashboardWeekHeader}>
                    <View>
                      <Text style={styles.dashboardWeekEyebrow}>DENNE UKEN</Text>
                      <Text style={styles.dashboardWeekTitle}>Ukesoversikt</Text>
                    </View>
                    <Pressable onPress={() => setActiveTab("Historikk")}>
                      <Text style={styles.dashboardWeekLink}>Se historikk ›</Text>
                    </Pressable>
                  </View>

                  <View style={styles.dashboardWeekStats}>
                    <View style={styles.dashboardWeekStat}>
                      <Text style={styles.dashboardWeekStatValue}>{dashboardWeekAverage}</Text>
                      <Text style={styles.dashboardWeekStatUnit}>kcal i snitt</Text>
                    </View>
                    <View style={styles.dashboardWeekDivider} />
                    <View style={styles.dashboardWeekStat}>
                      <Text style={styles.dashboardWeekStatValue}>{dashboardDaysNearGoal}/7</Text>
                      <Text style={styles.dashboardWeekStatUnit}>dager nær mål</Text>
                    </View>
                    <View style={styles.dashboardWeekDivider} />
                    <View style={styles.dashboardWeekStat}>
                      <Text style={styles.dashboardWeekStatValue}>{Math.round(dashboardBestProtein)} g</Text>
                      <Text style={styles.dashboardWeekStatUnit}>beste protein</Text>
                    </View>
                  </View>

                  <View style={styles.dashboardMiniChart}>
                    {dashboardWeekRows.map((day) => {
                      const height = Math.max(8, Math.round((day.calories / dashboardChartMax) * 72));
                      const nearGoal =
                        day.calories > 0 &&
                        calorieGoal > 0 &&
                        Math.abs(day.calories - calorieGoal) <= calorieGoal * 0.1;
                      const label = new Date(`${day.dateKey}T12:00:00`).toLocaleDateString("nb-NO", { weekday: "short" }).slice(0, 2);
                      return (
                        <View key={day.dateKey} style={styles.dashboardMiniChartColumn}>
                          <View style={styles.dashboardMiniBarTrack}>
                            <View
                              style={[
                                styles.dashboardMiniBar,
                                { height, backgroundColor: nearGoal ? "#3EDB91" : "#8B6CFF" },
                              ]}
                            />
                          </View>
                          <Text style={styles.dashboardMiniChartLabel}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {latestLoggedItems.length > 0 && (
                  <View style={styles.dashboardRecentCard}>
                    <View style={styles.dashboardWeekHeader}>
                      <View>
                        <Text style={styles.dashboardWeekEyebrow}>NYLIG</Text>
                        <Text style={styles.dashboardWeekTitle}>Sist registrert</Text>
                      </View>
                      <Pressable onPress={() => setActiveTab("Legg til")}>
                        <Text style={styles.dashboardWeekLink}>Legg til ›</Text>
                      </Pressable>
                    </View>
                    {latestLoggedItems.map((item, index) => (
                      <View key={`${item.id}-${item.dateKey}-${index}`} style={styles.dashboardRecentRow}>
                        <View style={styles.dashboardRecentIcon}>
                          <Text style={styles.dashboardRecentIconText}>🍽️</Text>
                        </View>
                        <View style={styles.dashboardRecentText}>
                          <Text style={styles.dashboardRecentName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.dashboardRecentMeta}>{item.meal} · {item.amountGrams ?? 100} g</Text>
                        </View>
                        <Text style={styles.dashboardRecentCalories}>{Math.round(toSafeNumber(item.calories))} kcal</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.premiumSectionRow}>
                  <Text style={styles.premiumSectionTitle}>Dagens måltider</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.copyMenuButton,
                      pressed && styles.copyMenuButtonPressed,
                    ]}
                    onPress={() => setCopyMenuOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Åpne kopieringsmeny"
                  >
                    <Text style={styles.copyMenuButtonText}>•••</Text>
                  </Pressable>
                </View>

                {([
                  { meal: "Frokost" as Meal, icon: "☀️", color: "#FFC84A", maximum: 0.3 },
                  { meal: "Lunsj" as Meal, icon: "🥗", color: "#43D17D", maximum: 0.35 },
                  { meal: "Middag" as Meal, icon: "🍽️", color: "#8A70FF", maximum: 0.4 },
                  { meal: "Mellommåltid" as Meal, icon: "🍎", color: "#F05C9B", maximum: 0.2 },
                ]).map((mealInfo) => {
                  const mealItems = diary.filter((item) => item.meal === mealInfo.meal);
                  const mealCalories = mealItems.reduce((total, item) => total + toSafeNumber(item.calories), 0);
                  const mealProgress = Math.min(100, mealCalories / Math.max(1, calorieGoal * mealInfo.maximum) * 100);
                  const displayMeal = mealInfo.meal === "Mellommåltid" ? "Snacks" : mealInfo.meal;
                  return (
                    <View key={`premium-${mealInfo.meal}`} style={styles.premiumMealCard}>
                      <View style={[styles.premiumMealIconBox, { backgroundColor: mealInfo.color }]}>
                        <Text style={styles.premiumMealIcon}>{mealInfo.icon}</Text>
                      </View>
                      <Pressable
                        style={styles.premiumMealContent}
                        onPress={() => { setMealDetailMeal(mealInfo.meal); setMealDetailOpen(true); }}
                      >
                        <View style={styles.premiumMealTop}>
                          <View>
                            <Text style={styles.premiumMealTitle}>{displayMeal}</Text>
                            <Text style={styles.premiumMealCount}>{mealItems.length} {mealItems.length === 1 ? "matvare" : "matvarer"}</Text>
                          </View>
                          <Text style={styles.premiumMealCalories}>{Math.round(mealCalories)} <Text style={styles.premiumMealUnit}>kcal</Text></Text>
                        </View>
                        <View style={styles.premiumMealTrack}>
                          <View style={[styles.premiumMealFill, { width: `${mealProgress}%`, backgroundColor: mealInfo.color }]} />
                        </View>
                      </Pressable>
                      <Pressable
                        style={styles.premiumAddButton}
                        onPress={() => { setSelectedMeal(mealInfo.meal); setActiveTab("Legg til"); }}
                      >
                        <Text style={styles.premiumAddText}>+</Text>
                      </Pressable>
                    </View>
                  );
                })}

                <View style={styles.premiumInsightGrid}>
                  <Pressable style={styles.premiumInsightCard} onPress={() => setWeightOpen(true)}>
                    <View style={styles.premiumInsightHeader}>
                      <Text style={styles.premiumInsightLabel}>Vekt</Text>
                      <Text style={styles.premiumPositiveText}>{weightChange <= 0 ? "↓" : "↑"} {Math.abs(weightChange)} kg</Text>
                    </View>
                    <Text style={styles.premiumInsightValue}>{latestWeight !== null ? latestWeight : "–"}<Text style={styles.premiumInsightUnit}> kg</Text></Text>
                    <Text style={styles.premiumInsightDescription}>{targetWeight > 0 ? `Mål ${targetWeight} kg` : "Trykk for å registrere"}</Text>
                  </Pressable>

                  <Pressable style={styles.premiumInsightCard} onPress={() => setActiveTab("Historikk")}>
                    <Text style={styles.premiumInsightLabel}>Fremgang</Text>
                    <View style={styles.premiumMiniRing}>
                      <Text style={styles.premiumMiniRingValue}>{progressToTarget}%</Text>
                    </View>
                    <Text style={styles.premiumInsightDescription}>mot vektmålet</Text>
                  </Pressable>

                  <View style={styles.premiumInsightCard}>
                    <Text style={styles.premiumInsightLabel}>Dagens streak</Text>
                    <Text style={styles.premiumStreakValue}>🔥 {currentStreak}</Text>
                    <Text style={styles.premiumInsightDescription}>dager på rad</Text>
                  </View>

                  <View style={styles.premiumInsightCard}>
                    <Text style={styles.premiumInsightLabel}>Dagens score</Text>
                    <Text style={styles.premiumScoreValue}>{dailyScore}<Text style={styles.premiumScoreUnit}>/100</Text></Text>
                    <Text style={styles.premiumInsightDescription}>basert på mål og makroer</Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {activeTab === "Legg til" && (
              <>
            <View style={styles.premiumScreenHeader}>
              <Text style={styles.premiumScreenEyebrow}>MATDAGBOK</Text>
              <Text style={styles.premiumScreenTitle}>Legg til mat</Text>
              <Text style={styles.premiumScreenSubtitle}>Finn maten raskt og legg den til i {selectedMeal.toLowerCase()}.</Text>
            </View>

            <View style={styles.addHeroCard}>
              <View style={styles.addHeroTop}>
                <View style={styles.addHeroIcon}><Text style={styles.addHeroIconText}>＋</Text></View>
                <View style={styles.addHeroText}>
                  <Text style={styles.addHeroTitle}>Hva vil du registrere?</Text>
                  <Text style={styles.addHeroSubtitle}>Søk, skann eller legg inn maten selv.</Text>
                </View>
              </View>

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Søk etter mat eller produkt"
                placeholderTextColor="#748097"
                style={styles.addHeroSearch}
                autoCorrect={false}
              />
            </View>

            <View style={styles.addActionGrid}>
              <Pressable style={[styles.addActionCard, styles.addActionPrimary]} onPress={openScanner}>
                <Text style={styles.addActionIcon}>▣</Text>
                <Text style={styles.addActionTitle}>Skann vare</Text>
                <Text style={styles.addActionText}>Bruk strekkoden</Text>
              </Pressable>

              <Pressable style={styles.addActionCard} onPress={openManualEntry}>
                <Text style={styles.addActionIcon}>✎</Text>
                <Text style={styles.addActionTitle}>Manuelt</Text>
                <Text style={styles.addActionText}>Lag egen matvare</Text>
              </Pressable>

            </View>

            <View style={styles.addSectionHeadingRow}>
              <View>
                <Text style={styles.addSectionEyebrow}>MÅLTID</Text>
                <Text style={styles.addSectionHeading}>Hvor skal maten legges?</Text>
              </View>
            </View>

            <View style={styles.mealRow}>
              {(["Frokost", "Lunsj", "Middag", "Mellommåltid"] as Meal[]).map(
                (meal) => (
                  <Pressable
                    key={meal}
                    style={[
                      styles.mealButton,
                      selectedMeal === meal && styles.mealButtonSelected,
                    ]}
                    onPress={() => setSelectedMeal(meal)}
                  >
                    <Text
                      style={[
                        styles.mealButtonText,
                        selectedMeal === meal &&
                          styles.mealButtonTextSelected,
                      ]}
                    >
                      {meal}
                    </Text>
                  </Pressable>
                )
              )}
            </View>

            <View style={styles.addContentSection}>
              <View style={styles.recipeHeaderRow}>
                <View><Text style={styles.addSectionEyebrow}>SNARVEIER</Text><Text style={styles.quickSectionTitle}>Måltidsmaler</Text></View>

                <Pressable
                  style={styles.newRecipeButton}
                  onPress={openMealTemplateCreator}
                >
                  <Text style={styles.newRecipeButtonText}>
                    Ny måltidsmal
                  </Text>
                </Pressable>
              </View>

              {mealTemplates.length === 0 ? (
                <Text style={styles.recipeEmptyText}>
                  Ingen måltidsmaler lagret.
                </Text>
              ) : (
                mealTemplates.slice(0, 8).map((template) => {
                  const totalCalories = template.items.reduce(
                    (sum, item) =>
                      sum +
                      (toSafeNumber(item.food.calories) *
                        item.amountGrams) /
                        100,
                    0
                  );

                  return (
                    <View key={template.id} style={styles.recipeRow}>
                      <Pressable
                        style={styles.recipeMain}
                        onPress={() =>
                          addMealTemplateToDiary(template)
                        }
                      >
                        <Text style={styles.recipeName}>
                          {template.name}
                        </Text>
                        <Text style={styles.recipeDetails}>
                          {Math.round(totalCalories)} kcal ·{" "}
                          {template.items.length} matvarer ·{" "}
                          {template.meal}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.recipeDeleteButton}
                        onPress={() =>
                          deleteMealTemplate(template.id)
                        }
                      >
                        <Text style={styles.recipeDeleteText}>
                          Slett
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.addContentSection}>
              <View style={styles.recipeHeaderRow}>
                <View><Text style={styles.addSectionEyebrow}>MINE RETTER</Text><Text style={styles.quickSectionTitle}>Oppskrifter</Text></View>

                <Pressable
                  style={styles.newRecipeButton}
                  onPress={openRecipeCreator}
                >
                  <Text style={styles.newRecipeButtonText}>
                    Ny oppskrift
                  </Text>
                </Pressable>
              </View>

              {recipes.length === 0 ? (
                <Text style={styles.recipeEmptyText}>
                  Ingen oppskrifter lagret.
                </Text>
              ) : (
                recipes.slice(0, 8).map((recipe) => {
                  const totals = getRecipeTotals(recipe.ingredients);
                  const servings = Math.max(1, recipe.servings);
                  const perServing = {
                    calories: Math.round(totals.calories / servings),
                    protein: Math.round((totals.protein / servings) * 10) / 10,
                    carbs: Math.round((totals.carbs / servings) * 10) / 10,
                    fat: Math.round((totals.fat / servings) * 10) / 10,
                  };

                  return (
                    <View key={recipe.id} style={styles.recipeCardV2}>
                      <Pressable
                        style={styles.recipeCardMainV2}
                        onPress={() => chooseRecipePortion(recipe)}
                      >
                        <View style={styles.recipeCardTopV2}>
                          <View style={styles.recipeIconV2}>
                            <Text style={styles.recipeIconTextV2}>🍲</Text>
                          </View>
                          <View style={styles.recipeMain}>
                            <Text style={styles.recipeName}>{recipe.name}</Text>
                            <Text style={styles.recipeDetails}>
                              {recipe.ingredients.length} ingredienser · {recipe.servings} porsjoner
                            </Text>
                          </View>
                          <View style={styles.recipeCaloriesBadgeV2}>
                            <Text style={styles.recipeCaloriesValueV2}>{perServing.calories}</Text>
                            <Text style={styles.recipeCaloriesLabelV2}>kcal</Text>
                          </View>
                        </View>

                        <View style={styles.recipeMacroRowV2}>
                          <View style={styles.recipeMacroPillV2}><Text style={styles.recipeMacroTextV2}>P {perServing.protein} g</Text></View>
                          <View style={styles.recipeMacroPillV2}><Text style={styles.recipeMacroTextV2}>K {perServing.carbs} g</Text></View>
                          <View style={styles.recipeMacroPillV2}><Text style={styles.recipeMacroTextV2}>F {perServing.fat} g</Text></View>
                        </View>

                        <Text style={styles.recipeTapHintV2}>Trykk for å velge ½, 1 eller 2 porsjoner</Text>
                      </Pressable>

                      <View style={styles.recipeActionsV2}>
                        <Pressable style={styles.recipeSecondaryButtonV2} onPress={() => duplicateRecipe(recipe)}>
                          <Text style={styles.recipeSecondaryButtonTextV2}>Kopier</Text>
                        </Pressable>
                        <Pressable style={styles.recipeSecondaryButtonV2} onPress={() => openRecipeEditor(recipe)}>
                          <Text style={styles.recipeSecondaryButtonTextV2}>Rediger</Text>
                        </Pressable>
                        <Pressable style={styles.recipeDeleteButtonV2} onPress={() => deleteRecipe(recipe.id)}>
                          <Text style={styles.recipeDeleteText}>Slett</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.favoriteV2Section}>
              <View style={styles.favoriteV2Header}>
                <View>
                  <Text style={styles.addSectionEyebrow}>RASK TILGANG</Text>
                  <Text style={styles.quickSectionTitle}>Favoritter</Text>
                </View>
                <View style={styles.favoriteV2CountBadge}>
                  <Text style={styles.favoriteV2CountText}>{favoriteFoods.length}</Text>
                </View>
              </View>

              {favoriteFoods.length > 0 ? (
                <>
                  <View style={styles.favoriteV2SearchBox}>
                    <Text style={styles.favoriteV2SearchIcon}>⌕</Text>
                    <TextInput
                      value={favoriteSearch}
                      onChangeText={setFavoriteSearch}
                      placeholder="Søk i favoritter"
                      placeholderTextColor="#728097"
                      style={styles.favoriteV2SearchInput}
                    />
                  </View>

                  {visibleFavoriteFoods.slice(0, 8).map((food) => (
                    <View key={`favorite-${foodKey(food)}`} style={styles.favoriteV2Card}>
                      <Pressable
                        style={styles.favoriteV2Main}
                        onPress={() => openQuickAdd(food)}
                      >
                        <View style={styles.favoriteV2Icon}>
                          <Text style={styles.favoriteV2IconText}>★</Text>
                        </View>
                        <View style={styles.favoriteV2TextWrap}>
                          <View style={styles.favoriteV2NameRow}>
                            <Text numberOfLines={1} style={styles.favoriteV2Name}>{food.name}</Text>
                            {isPinnedFavorite(food) && (
                              <View style={styles.favoriteV2PinnedBadge}><Text style={styles.favoriteV2PinnedText}>FESTET</Text></View>
                            )}
                          </View>
                          <Text style={styles.favoriteV2Meta}>
                            {food.calories} kcal · P {toSafeNumber(food.protein)} g · K {toSafeNumber(food.carbs)} g · F {toSafeNumber(food.fat)} g
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable style={styles.favoriteV2PinButton} onPress={() => togglePinnedFavorite(food)}>
                        <Text style={styles.favoriteV2PinText}>{isPinnedFavorite(food) ? "⌖" : "⌑"}</Text>
                      </Pressable>
                      <Pressable style={styles.favoriteV2AddButton} onPress={() => openQuickAdd(food)}>
                        <Text style={styles.favoriteV2AddText}>+</Text>
                      </Pressable>
                    </View>
                  ))}

                  {visibleFavoriteFoods.length === 0 && (
                    <Text style={styles.favoriteV2EmptyText}>Ingen favoritter matcher søket.</Text>
                  )}
                </>
              ) : (
                <View style={styles.favoriteV2EmptyCard}>
                  <Text style={styles.favoriteV2EmptyIcon}>☆</Text>
                  <Text style={styles.favoriteV2EmptyTitle}>Ingen favoritter ennå</Text>
                  <Text style={styles.favoriteV2EmptyText}>Trykk på stjernen ved en matvare for å lagre den her.</Text>
                </View>
              )}
            </View>

            {recentFoods.length > 0 && (
              <View style={styles.addContentSection}>
                <Text style={styles.addSectionEyebrow}>SIST BRUKT</Text>
                <Text style={styles.quickSectionTitle}>Nylig brukt</Text>

                {recentFoods.slice(0, 5).map((food) => (
                  <View key={`recent-${foodKey(food)}`} style={styles.quickFoodRow}>
                    <Pressable
                      style={styles.quickFoodMain}
                      onPress={() => openQuickAdd(food)}
                    >
                      <Text style={styles.quickFoodName}>{food.name}</Text>
                      <Text style={styles.quickFoodDetails}>
                        {food.calories} kcal · P {food.protein} g
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.favoriteButton}
                      onPress={() => toggleFavorite(food)}
                    >
                      <Text style={styles.favoriteButtonText}>
                        {isFavorite(food) ? "★" : "☆"}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}


            <View style={styles.addResultsHeader}>
              <View>
                <Text style={styles.addSectionEyebrow}>MATVAREDATABASE</Text>
                <Text style={styles.addSectionHeading}>Søkeresultater</Text>
              </View>
              {!!search.trim() && <Text style={styles.addResultCount}>{filteredFoods.length} treff</Text>}
            </View>

            <View style={styles.foodDatabaseStatus}>
              {(isLoadingFoodDatabase || isSearchingOnline) && (
                <ActivityIndicator size="small" />
              )}

              <Text style={styles.foodDatabaseStatusText}>
                {isSearchingOnline
                  ? "Søker først i norske produkter, deretter Europa …"
                  : foodDatabaseMessage}
              </Text>
            </View>
              </>
            )}

            {activeTab === "Profil" && (
              <>
                <View style={styles.profileHeroCard}>
                  <View style={styles.profileHeroTopRow}>
                    <View style={styles.profileAvatar}>
                      <Text style={styles.profileAvatarText}>
                        {(displayName.charAt(0) || "G").toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.profileHeroIdentity}>
                      <Text style={styles.profileHeroEyebrow}>DIN PROFIL</Text>
                      <Text style={styles.profileHeroName}>{displayName}</Text>
                      <Text style={styles.profileHeroEmail}>{accountEmail}</Text>
                    </View>
                    <View style={styles.profilePremiumBadge}>
                      <Text style={styles.profilePremiumBadgeText}>PREMIUM</Text>
                    </View>
                  </View>

                  <View style={styles.profileStatsRow}>
                    <View style={styles.profileStatItem}>
                      <Text style={styles.profileStatValue}>{currentStreak}</Text>
                      <Text style={styles.profileStatLabel}>dagers streak</Text>
                    </View>
                    <View style={styles.profileStatDivider} />
                    <View style={styles.profileStatItem}>
                      <Text style={styles.profileStatValue}>{dailyScore}</Text>
                      <Text style={styles.profileStatLabel}>dagens score</Text>
                    </View>
                    <View style={styles.profileStatDivider} />
                    <View style={styles.profileStatItem}>
                      <Text style={styles.profileStatValue}>
                        {latestWeight !== null ? latestWeight : "–"}
                      </Text>
                      <Text style={styles.profileStatLabel}>kg nå</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.profileSectionHeader}>
                  <Text style={styles.profileSectionEyebrow}>MÅL OG FREMGANG</Text>
                  <Text style={styles.profileSectionTitle}>Dine mål</Text>
                </View>

                <View style={styles.profileGoalGrid}>
                  <Pressable style={styles.profileGoalCard} onPress={openMacroGoalEditor}>
                    <View style={[styles.profileGoalIcon, styles.profileGoalIconPurple]}>
                      <Text style={styles.profileGoalIconText}>◎</Text>
                    </View>
                    <Text style={styles.profileGoalLabel}>Kalorimål</Text>
                    <Text style={styles.profileGoalValue}>{Math.round(calorieGoal)}</Text>
                    <Text style={styles.profileGoalUnit}>kcal per dag</Text>
                  </Pressable>

                  <Pressable style={styles.profileGoalCard} onPress={() => setWeightOpen(true)}>
                    <View style={[styles.profileGoalIcon, styles.profileGoalIconGreen]}>
                      <Text style={styles.profileGoalIconText}>↘</Text>
                    </View>
                    <Text style={styles.profileGoalLabel}>Målvekt</Text>
                    <Text style={styles.profileGoalValue}>
                      {targetWeight > 0 ? targetWeight : "–"}
                    </Text>
                    <Text style={styles.profileGoalUnit}>kilogram</Text>
                  </Pressable>
                </View>

                <Pressable style={styles.profileMacroCard} onPress={openMacroGoalEditor}>
                  <View style={styles.profileCardHeaderRow}>
                    <View>
                      <Text style={styles.profileCardEyebrow}>MAKROFORDELING</Text>
                      <Text style={styles.profileCardTitle}>Daglige makromål</Text>
                    </View>
                    <Text style={styles.profileCardArrow}>›</Text>
                  </View>
                  <View style={styles.profileMacroRow}>
                    <View style={styles.profileMacroItem}>
                      <View style={[styles.profileMacroDot, { backgroundColor: "#B26BFF" }]} />
                      <Text style={styles.profileMacroValue}>{Math.round(proteinGoal)} g</Text>
                      <Text style={styles.profileMacroLabel}>Protein</Text>
                    </View>
                    <View style={styles.profileMacroItem}>
                      <View style={[styles.profileMacroDot, { backgroundColor: "#FFB04A" }]} />
                      <Text style={styles.profileMacroValue}>{Math.round(carbsGoal)} g</Text>
                      <Text style={styles.profileMacroLabel}>Karbo</Text>
                    </View>
                    <View style={styles.profileMacroItem}>
                      <View style={[styles.profileMacroDot, { backgroundColor: "#4DD5B2" }]} />
                      <Text style={styles.profileMacroValue}>{Math.round(fatGoal)} g</Text>
                      <Text style={styles.profileMacroLabel}>Fett</Text>
                    </View>
                  </View>
                </Pressable>

                <View style={styles.profileSectionHeader}>
                  <Text style={styles.profileSectionEyebrow}>PERSONLIG</Text>
                  <Text style={styles.profileSectionTitle}>Kroppsdata</Text>
                </View>

                <Pressable
                  style={styles.profileBodyCard}
                  onPress={() => setProfileOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Rediger personlig kroppsdata"
                >
                  <View style={styles.profileBodyGrid}>
                    <View style={styles.profileBodyItem}>
                      <Text style={styles.profileBodyLabel}>Alder</Text>
                      <Text style={styles.profileBodyValue}>{profile.age || "–"}</Text>
                    </View>
                    <View style={styles.profileBodyItem}>
                      <Text style={styles.profileBodyLabel}>Høyde</Text>
                      <Text style={styles.profileBodyValue}>{profile.heightCm ? `${profile.heightCm} cm` : "–"}</Text>
                    </View>
                    <View style={styles.profileBodyItem}>
                      <Text style={styles.profileBodyLabel}>Mål</Text>
                      <Text style={styles.profileBodyValue}>{profile.goal}</Text>
                    </View>
                    <View style={styles.profileBodyItem}>
                      <Text style={styles.profileBodyLabel}>Aktivitet</Text>
                      <Text style={styles.profileBodyValue}>{profile.activity}</Text>
                    </View>
                  </View>
                  <Text style={styles.profileCardArrow}>Trykk for å redigere  ›</Text>
                </Pressable>

                <View style={styles.profileSectionHeader}>
                  <Text style={styles.profileSectionEyebrow}>INNSTILLINGER</Text>
                  <Text style={styles.profileSectionTitle}>App og konto</Text>
                </View>

                <View style={styles.profileMenuCard}>
                  <Pressable style={styles.profileMenuRow} onPress={() => setThemePickerOpen(true)}>
                    <View style={[styles.profileMenuIcon, styles.profileMenuIconPurple]}><Text style={styles.profileMenuIconText}>◐</Text></View>
                    <View style={styles.profileMenuTextWrap}>
                      <Text style={styles.profileMenuTitle}>Fargetema</Text>
                      <Text style={styles.profileMenuSubtitle}>{appTheme}</Text>
                    </View>
                    <Text style={styles.profileMenuArrow}>›</Text>
                  </Pressable>

                  <View style={styles.profileMenuDivider} />

                  <Pressable style={styles.profileMenuRow} onPress={() => setWeightOpen(true)}>
                    <View style={[styles.profileMenuIcon, styles.profileMenuIconGreen]}><Text style={styles.profileMenuIconText}>⚖</Text></View>
                    <View style={styles.profileMenuTextWrap}>
                      <Text style={styles.profileMenuTitle}>Vekt og målvekt</Text>
                      <Text style={styles.profileMenuSubtitle}>{latestWeight !== null ? `${latestWeight} kg registrert` : "Ingen vekt registrert"}</Text>
                    </View>
                    <Text style={styles.profileMenuArrow}>›</Text>
                  </Pressable>

                  <View style={styles.profileMenuDivider} />

                  <View style={styles.profileMenuRow}>
                    <View style={[styles.profileMenuIcon, styles.profileMenuIconOrange]}><Text style={styles.profileMenuIconText}>✦</Text></View>
                    <View style={styles.profileMenuTextWrap}>
                      <Text style={styles.profileMenuTitle}>AI Coach</Text>
                      <Text style={styles.profileMenuSubtitle}>Kommer i neste hovedversjon</Text>
                    </View>
                    <View style={styles.profileComingBadge}><Text style={styles.profileComingBadgeText}>SNART</Text></View>
                  </View>
                </View>

                <Pressable style={styles.profileLogoutButton} onPress={onSignOut}>
                  <Text style={styles.profileLogoutText}>Logg ut</Text>
                </Pressable>

                <Pressable style={styles.profileDeleteButton} onPress={deleteAccount}>
                  <Text style={styles.profileDeleteText}>Slett konto permanent</Text>
                </Pressable>
              </>
            )}

            {activeTab === "Historikk" && (
              <>
                <View style={styles.premiumScreenHeader}>
                  <View style={styles.premiumTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.premiumScreenEyebrow}>FREMGANG</Text>
                      <Text style={styles.premiumScreenTitle}>Historikk</Text>
                      <Text style={styles.premiumScreenSubtitle}>Se utviklingen din over tid.</Text>
                    </View>
                    <View style={styles.premiumCalendarBadge}><Text style={styles.premiumCalendarIcon}>▣</Text></View>
                  </View>
                  <View style={styles.premiumHistoryDate}>
                    <Pressable onPress={() => setSelectedDate((date) => moveDate(date, -1))}><Text style={styles.premiumHistoryArrow}>‹</Text></Pressable>
                    <Pressable onPress={() => setSelectedDate(todayKey)}><Text style={styles.premiumHistoryDateText}>{formatDate(selectedDate)}</Text></Pressable>
                    <Pressable onPress={() => setSelectedDate((date) => moveDate(date, 1))}><Text style={styles.premiumHistoryArrow}>›</Text></Pressable>
                  </View>
                </View>

                <View style={styles.historyPeriodSelector}>
                  {historyPeriodOptions.map((option) => (
                    <Pressable
                      key={option.key}
                      style={[
                        styles.historyPeriodButton,
                        historyPeriod === option.key && styles.historyPeriodButtonActive,
                      ]}
                      onPress={() => setHistoryPeriod(option.key)}
                    >
                      <Text
                        style={[
                          styles.historyPeriodButtonText,
                          historyPeriod === option.key && styles.historyPeriodButtonTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.historyTabs}>
                  <Pressable
                    style={[
                      styles.historyTabButton,
                      historyTab === "Mat" &&
                        styles.historyTabButtonActive,
                    ]}
                    onPress={() => setHistoryTab("Mat")}
                  >
                    <Text
                      style={[
                        styles.historyTabText,
                        historyTab === "Mat" &&
                          styles.historyTabTextActive,
                      ]}
                    >
                      Mat og kalorier
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.historyTabButton,
                      historyTab === "Vekt" &&
                        styles.historyTabButtonActive,
                    ]}
                    onPress={() => setHistoryTab("Vekt")}
                  >
                    <Text
                      style={[
                        styles.historyTabText,
                        historyTab === "Vekt" &&
                          styles.historyTabTextActive,
                      ]}
                    >
                      Vektutvikling
                    </Text>
                  </Pressable>
                </View>

                {historyTab === "Mat" ? (
                  <>
                    <View style={styles.historyHeroCard}>
                      <View style={styles.historyHeroTopRow}>
                        <View>
                          <Text style={styles.historyHeroEyebrow}>PERIODEOVERSIKT</Text>
                          <Text style={styles.historyHeroTitle}>{activeHistoryPeriod.title}</Text>
                          <Text style={styles.historyHeroSubtitle}>
                            {daysWithFood > 0
                              ? `${daysWithFood} registrerte dager`
                              : "Ingen registreringer ennå"}
                          </Text>
                        </View>

                        <View style={styles.historyGoalRing}>
                          <Text style={styles.historyGoalRingValue}>{weeklyGoalProgress}%</Text>
                          <Text style={styles.historyGoalRingLabel}>av mål</Text>
                        </View>
                      </View>

                      <View style={styles.historyStatsRow}>
                        <View style={styles.historyStatCard}>
                          <Text style={styles.historyStatIcon}>🔥</Text>
                          <Text style={styles.historyStatValue}>{averageCalories}</Text>
                          <Text style={styles.historyStatLabel}>kcal i snitt</Text>
                        </View>

                        <View style={styles.historyStatCard}>
                          <Text style={styles.historyStatIcon}>🎯</Text>
                          <Text style={styles.historyStatValue}>{daysOnGoal} / {historyPeriodDays}</Text>
                          <Text style={styles.historyStatLabel}>dager nær mål</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.historyTrendCard}>
                      <View style={styles.historySectionHeader}>
                        <View>
                          <Text style={styles.historySectionEyebrow}>KALORITREND</Text>
                          <Text style={styles.historySectionTitle}>{historyPeriodDays === 7 ? "Dag for dag" : "Utvikling i perioden"}</Text>
                        </View>
                        <View style={styles.historyGoalBadge}>
                          <Text style={styles.historyGoalBadgeText}>Mål {calorieGoal}</Text>
                        </View>
                      </View>

                      <View style={styles.historyChart}>
                        {weeklyRows.map((day) => {
                          const height = Math.max(8, Math.min(112, calorieGoal > 0 ? (day.calories / calorieGoal) * 92 : 8));
                          const isNearGoal = day.calories > 0 && calorieGoal > 0 && Math.abs(day.calories - calorieGoal) <= calorieGoal * 0.1;
                          return (
                            <View key={`chart-${day.dateKey}`} style={styles.historyChartColumn}>
                              <Text style={styles.historyChartValue}>{day.calories || "–"}</Text>
                              <View style={styles.historyChartTrack}>
                                <View
                                  style={[
                                    styles.historyChartBar,
                                    isNearGoal && styles.historyChartBarOnGoal,
                                    { height },
                                  ]}
                                />
                              </View>
                              <Text style={styles.historyChartDate}>{formatShortDate(day.dateKey)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.historyMacroOverviewCard}>
                      <View style={styles.historySectionHeader}>
                        <View>
                          <Text style={styles.historySectionEyebrow}>MAKROFORDELING</Text>
                          <Text style={styles.historySectionTitle}>Gjennomsnitt per dag</Text>
                        </View>
                      </View>

                      <View style={styles.historyMacroPremiumRow}>
                        <View style={styles.historyMacroPremiumCard}>
                          <View style={[styles.historyMacroDot, { backgroundColor: "#B26BFF" }]} />
                          <Text style={styles.historyMacroPremiumValue}>{averageProtein} g</Text>
                          <Text style={styles.historyMacroPremiumLabel}>Protein · {proteinShare}%</Text>
                        </View>
                        <View style={styles.historyMacroPremiumCard}>
                          <View style={[styles.historyMacroDot, { backgroundColor: "#FFB04A" }]} />
                          <Text style={styles.historyMacroPremiumValue}>{averageCarbs} g</Text>
                          <Text style={styles.historyMacroPremiumLabel}>Karbo · {carbsShare}%</Text>
                        </View>
                        <View style={styles.historyMacroPremiumCard}>
                          <View style={[styles.historyMacroDot, { backgroundColor: "#4DD5B2" }]} />
                          <Text style={styles.historyMacroPremiumValue}>{averageFat} g</Text>
                          <Text style={styles.historyMacroPremiumLabel}>Fett · {fatShare}%</Text>
                        </View>
                      </View>

                      <View style={styles.historyMacroBar}>
                        <View style={[styles.historyMacroBarProtein, { flex: Math.max(1, proteinShare) }]} />
                        <View style={[styles.historyMacroBarCarbs, { flex: Math.max(1, carbsShare) }]} />
                        <View style={[styles.historyMacroBarFat, { flex: Math.max(1, fatShare) }]} />
                      </View>
                    </View>

                    <View style={styles.historyComparisonPremiumCard}>
                      <View style={styles.historyComparisonIconWrap}>
                        <Text style={styles.historyComparisonIcon}>↗</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyComparisonLabel}>Sammenlignet med forrige periode</Text>
                        <Text style={styles.historyComparisonValue}>
                          {previousDaysWithFood === 0
                            ? "Ingen data fra forrige periode"
                            : `${calorieDifference > 0 ? "+" : ""}${calorieDifference} kcal per dag`}
                        </Text>
                      </View>
                    </View>


                    <View style={styles.advancedCalendarCard}>
                      <View style={styles.historySectionHeader}>
                        <View>
                          <Text style={styles.historySectionEyebrow}>MÅNEDSKALENDER</Text>
                          <Text style={styles.historySectionTitle}>
                            {selectedDateObject.toLocaleDateString("nb-NO", { month: "long", year: "numeric" })}
                          </Text>
                        </View>
                        <View style={styles.advancedCalendarSummary}>
                          <Text style={styles.advancedCalendarSummaryValue}>{monthGoalDays}</Text>
                          <Text style={styles.advancedCalendarSummaryLabel}>på mål</Text>
                        </View>
                      </View>

                      <View style={styles.advancedCalendarWeekRow}>
                        {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((day, index) => (
                          <Text key={`${day}-${index}`} style={styles.advancedCalendarWeekday}>{day}</Text>
                        ))}
                      </View>
                      <View style={styles.advancedCalendarGrid}>
                        {monthCalendarCells.map((row, index) => {
                          if (!row) return <View key={`empty-${index}`} style={styles.advancedCalendarCell} />;
                          const dayNumber = Number(row.dateKey.slice(-2));
                          const nearGoal = row.calories > 0 && calorieGoal > 0 && Math.abs(row.calories - calorieGoal) <= calorieGoal * 0.1;
                          const overGoal = row.calories > calorieGoal * 1.1;
                          const underGoal = row.calories > 0 && row.calories < calorieGoal * 0.9;
                          return (
                            <Pressable
                              key={row.dateKey}
                              style={styles.advancedCalendarCell}
                              onPress={() => setSelectedDate(row.dateKey)}
                            >
                              <View style={[
                                styles.advancedCalendarDay,
                                nearGoal && styles.advancedCalendarDayGoal,
                                overGoal && styles.advancedCalendarDayOver,
                                underGoal && styles.advancedCalendarDayUnder,
                                row.dateKey === selectedDate && styles.advancedCalendarDaySelected,
                              ]}>
                                <Text style={styles.advancedCalendarDayText}>{dayNumber}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.advancedCalendarLegend}>
                        <Text style={styles.advancedCalendarLegendText}>● Nær mål</Text>
                        <Text style={styles.advancedCalendarLegendText}>● Under</Text>
                        <Text style={styles.advancedCalendarLegendText}>● Over</Text>
                        <Text style={styles.advancedCalendarAverage}>{monthAverageCalories} kcal i snitt</Text>
                      </View>
                    </View>

                    <View style={styles.advancedMacroTrendCard}>
                      <View style={styles.historySectionHeader}>
                        <View>
                          <Text style={styles.historySectionEyebrow}>MAKROTRENDER</Text>
                          <Text style={styles.historySectionTitle}>Utvikling gjennom perioden</Text>
                        </View>
                      </View>
                      <View style={styles.advancedMacroLegend}>
                        <Text style={styles.advancedMacroLegendProtein}>● Protein</Text>
                        <Text style={styles.advancedMacroLegendCarbs}>● Karbo</Text>
                        <Text style={styles.advancedMacroLegendFat}>● Fett</Text>
                      </View>
                      <View style={styles.advancedMacroChart}>
                        {macroTrendRows.map((row, index) => (
                          <View key={`${row.label}-${index}`} style={styles.advancedMacroColumn}>
                            <View style={styles.advancedMacroBars}>
                              <View style={[styles.advancedMacroBarProtein, { height: Math.max(4, (row.protein / macroTrendMax) * 88) }]} />
                              <View style={[styles.advancedMacroBarCarbs, { height: Math.max(4, (row.carbs / macroTrendMax) * 88) }]} />
                              <View style={[styles.advancedMacroBarFat, { height: Math.max(4, (row.fat / macroTrendMax) * 88) }]} />
                            </View>
                            <Text style={styles.advancedMacroLabel}>{row.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.weightHistoryCard}>
                      <Text style={styles.weekTitle}>Vektutvikling</Text>

                      {graphEntries.length < 2 ? (
                        <Text style={styles.historyText}>
                          Registrer minst to målinger for å se grafen.
                        </Text>
                      ) : (
                        <>
                          <View style={styles.weightGraph}>
                            {graphEntries.map((entry) => (
                              <View
                                key={`graph-${entry.id}`}
                                style={styles.weightGraphColumn}
                              >
                                <Text style={styles.weightGraphValue}>
                                  {entry.weightKg}
                                </Text>

                                <View style={styles.weightGraphTrack}>
                                  <View
                                    style={[
                                      styles.weightGraphBar,
                                      {
                                        height: getWeightBarHeight(
                                          entry.weightKg
                                        ),
                                      },
                                    ]}
                                  />
                                </View>

                                <Text style={styles.weightGraphDate}>
                                  {entry.date.slice(5).replace("-", "/")}
                                </Text>
                              </View>
                            ))}
                          </View>

                          <Text style={styles.weightGraphSummary}>
                            Fra {firstWeight} kg til {latestWeight} kg
                            {" · "}
                            {weightChange > 0 ? "+" : ""}
                            {weightChange} kg
                          </Text>

                          {targetWeight > 0 && (
                            <Text style={styles.weightTargetSummary}>
                              Mål: {targetWeight} kg · {progressToTarget}%
                              fullført
                            </Text>
                          )}
                        </>
                      )}
                    </View>

                    <View style={styles.weightHistoryCard}>
                      <Text style={styles.weekTitle}>Målinger</Text>

                      {weightEntries.length === 0 ? (
                        <Text style={styles.historyText}>
                          Ingen vektmålinger registrert.
                        </Text>
                      ) : (
                        weightEntries
                          .slice()
                          .reverse()
                          .slice(0, 10)
                          .map((entry) => (
                            <Pressable
                              key={entry.id}
                              style={styles.weightHistoryRow}
                              onPress={() => deleteWeightEntry(entry.id)}
                            >
                              <Text style={styles.weightHistoryDate}>
                                {formatDate(entry.date)}
                              </Text>
                              <Text style={styles.weightHistoryValue}>
                                {entry.weightKg} kg
                              </Text>
                            </Pressable>
                          ))
                      )}
                    </View>
                  </>
                )}
              </>
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.foodItem}>
            <Pressable
              style={styles.foodMainPress}
              onPress={() => openQuickAdd(item)}
            >
              <View style={styles.foodTextArea}>
                <Text style={styles.foodName}>{item.name}</Text>
                {!!item.brand && (
                  <Text style={styles.foodBrand}>{item.brand}</Text>
                )}
                <Text style={styles.foodProtein}>
                  P {toSafeNumber(item.protein)} g · K{" "}
                  {toSafeNumber(item.carbs)} g · F{" "}
                  {toSafeNumber(item.fat)} g
                </Text>
                <Text style={styles.foodSource}>
                  {item.source ?? "Egen"}
                  {item.isNorwegianProduct ? " · Norsk produkt" : ""}
                </Text>
              </View>

              <View style={styles.foodRight}>
                <Text style={styles.foodCalories}>
                  {item.calories} kcal
                </Text>
                <Text style={styles.addText}>Legg til</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.favoriteButton}
              onPress={() => toggleFavorite(item)}
            >
              <Text style={styles.favoriteButtonText}>
                {isFavorite(item) ? "★" : "☆"}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          activeTab === "Legg til" ? (
            <Text style={styles.noResults}>
              {isSearchingOnline
                ? "Søker etter produkter …"
                : "Ingen matvarer funnet. Prøv et annet navn eller skann strekkoden."}
            </Text>
          ) : null
        }
      />

      <View style={[styles.bottomNav, styles.premiumBottomNav]}>
        {(
          [
            { tab: "Oversikt" as const, icon: "⌂" },
            { tab: "Legg til" as const, icon: "+" },
            { tab: "Historikk" as const, icon: "▥" },
            { tab: "Profil" as const, icon: "○" },
          ]
        ).map(({ tab, icon }) => (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
            accessibilityLabel={tab}
            hitSlop={4}
            android_ripple={{ color: "#302A52", borderless: false }}
            style={({ pressed }) => [
              styles.navButton,
              activeTab === tab && styles.navButtonActive,
              styles.premiumNavButton,
              pressed && styles.premiumPressed,
            ]}
            onPress={() => changeTab(tab)}
          >
            <Text style={[styles.premiumNavIcon, activeTab === tab && styles.premiumNavIconActive]}>
              {icon}
            </Text>
            <Text
              style={[
                styles.navButtonText,
                activeTab === tab && styles.navButtonTextActive,
                styles.premiumNavText,
                activeTab === tab && styles.premiumNavTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {toastMessage ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.uxToast,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <View style={styles.uxToastIcon}>
            <Text style={styles.uxToastIconText}>✓</Text>
          </View>
          <Text style={styles.uxToastText} numberOfLines={2}>
            {toastMessage}
          </Text>
        </Animated.View>
      ) : null}

      <Modal
        visible={themePickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setThemePickerOpen(false)}
      >
        <View style={styles.weightOverlay}>
          <View style={styles.themePickerCard}>
            <Text style={styles.weightTitle}>Velg tema</Text>
            <Text style={styles.weightDescription}>
              Temaet lagres automatisk på denne mobilen.
            </Text>

            {themeOrder.map((themeName) => (
              <Pressable
                key={themeName}
                style={[
                  styles.themeOption,
                  appTheme === themeName &&
                    styles.themeOptionActive,
                ]}
                onPress={() => chooseTheme(themeName)}
              >
                <View
                  style={[
                    styles.themeColorDot,
                    { backgroundColor: themes[themeName].primary },
                  ]}
                />
                <Text style={styles.themeOptionText}>
                  {themeName}
                </Text>
                {appTheme === themeName && (
                  <Text style={styles.themeSelectedText}>Valgt</Text>
                )}
              </Pressable>
            ))}

            <Pressable
              style={styles.weightCancelButton}
              onPress={() => setThemePickerOpen(false)}
            >
              <Text style={styles.weightCancelButtonText}>Lukk</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={templateOpen}
        animationType="slide"
        onRequestClose={() => setTemplateOpen(false)}
      >
        <SafeAreaView style={styles.recipeScreen}>
          <StatusBar style={appTheme === "Light" ? "dark" : "light"} />

          <View style={styles.recipeModalHeader}>
            <Text style={styles.recipeModalTitle}>Ny måltidsmal</Text>

            <Pressable onPress={() => setTemplateOpen(false)}>
              <Text style={styles.recipeModalClose}>Lukk</Text>
            </Pressable>
          </View>

          <FlatList
            data={templateSearchResults}
            keyExtractor={(item) => `template-search-${item.id}`}
            contentContainerStyle={styles.recipeModalContent}
            ListHeaderComponent={
              <>
                <Text style={styles.recipeLabel}>Navn</Text>
                <TextInput
                  value={templateName}
                  onChangeText={setTemplateName}
                  style={styles.recipeInput}
                  placeholder="For eksempel Vanlig frokost"
                />

                <Text style={styles.recipeLabel}>Måltid</Text>
                <View style={styles.templateMealRow}>
                  {meals.map((meal) => (
                    <Pressable
                      key={`template-${meal}`}
                      style={[
                        styles.templateMealButton,
                        templateMeal === meal &&
                          styles.templateMealButtonActive,
                      ]}
                      onPress={() => setTemplateMeal(meal)}
                    >
                      <Text
                        style={[
                          styles.templateMealText,
                          templateMeal === meal &&
                            styles.templateMealTextActive,
                        ]}
                      >
                        {meal}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.recipeSubTitle}>Matvarer</Text>
                <Text style={styles.recipeHelperText}>
                  Trykk på en matvare for å fjerne den.
                </Text>

                {templateItems.length === 0 ? (
                  <Text style={styles.recipeEmptyText}>
                    Ingen matvarer lagt til.
                  </Text>
                ) : (
                  templateItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.recipeIngredientRow}
                      onPress={() => removeTemplateItem(item.id)}
                    >
                      <View style={styles.recipeMain}>
                        <Text style={styles.recipeName}>
                          {item.food.name}
                        </Text>
                        <Text style={styles.recipeDetails}>
                          {item.amountGrams} g
                        </Text>
                      </View>

                      <Text style={styles.recipeDeleteText}>Fjern</Text>
                    </Pressable>
                  ))
                )}

                <Text style={styles.recipeLabel}>Søk etter matvare</Text>
                <TextInput
                  value={templateFoodSearch}
                  onChangeText={setTemplateFoodSearch}
                  style={styles.recipeInput}
                  placeholder="Søk"
                />

                {selectedTemplateFood && (
                  <View style={styles.selectedRecipeFood}>
                    <Text style={styles.recipeName}>
                      Valgt: {selectedTemplateFood.name}
                    </Text>

                    <TextInput
                      value={templateAmount}
                      onChangeText={setTemplateAmount}
                      style={styles.recipeInput}
                      keyboardType="decimal-pad"
                      placeholder="100"
                    />

                    <Pressable
                      style={styles.numericDoneButton}
                      onPress={Keyboard.dismiss}
                    >
                      <Text style={styles.numericDoneButtonText}>
                        Bekreft
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.addIngredientButton}
                      onPress={addItemToTemplate}
                    >
                      <Text style={styles.addIngredientButtonText}>
                        Legg til matvare
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.recipeSearchRow}
                onPress={() => setSelectedTemplateFood(item)}
              >
                <Text style={styles.recipeName}>{item.name}</Text>
                <Text style={styles.recipeDetails}>
                  {item.calories} kcal per 100 g
                </Text>
              </Pressable>
            )}
            ListFooterComponent={
              <Pressable
                style={styles.saveRecipeButton}
                onPress={saveMealTemplate}
              >
                <Text style={styles.saveRecipeButtonText}>
                  Lagre måltidsmal
                </Text>
              </Pressable>
            }
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={recipeOpen}
        animationType="slide"
        onRequestClose={closeRecipeModal}
      >
        <SafeAreaView style={styles.recipeScreen}>
          <StatusBar style={appTheme === "Light" ? "dark" : "light"} />

          <View style={styles.recipeModalHeader}>
            <Text style={styles.recipeModalTitle}>
              {editingRecipeId ? "Rediger oppskrift" : "Ny oppskrift"}
            </Text>

            <Pressable onPress={closeRecipeModal}>
              <Text style={styles.recipeModalClose}>Lukk</Text>
            </Pressable>
          </View>

          <FlatList
            data={recipeSearchResults}
            keyExtractor={(item) => `recipe-search-${item.id}`}
            contentContainerStyle={styles.recipeModalContent}
            ListHeaderComponent={
              <>
                <Text style={styles.recipeLabel}>Navn</Text>
                <TextInput
                  value={recipeName}
                  onChangeText={setRecipeName}
                  style={styles.recipeInput}
                  placeholder="For eksempel Kylling og ris"
                />

                <Text style={styles.recipeLabel}>Antall porsjoner</Text>
                <TextInput
                  value={recipeServings}
                  onChangeText={setRecipeServings}
                  style={styles.recipeInput}
                  keyboardType="number-pad"
                  placeholder="2"
                />

                <Pressable
                  style={styles.numericDoneButton}
                  onPress={Keyboard.dismiss}
                >
                  <Text style={styles.numericDoneButtonText}>
                    Bekreft
                  </Text>
                </Pressable>

                {recipeIngredients.length > 0 && (() => {
                  const totals = getRecipeTotals(recipeIngredients);
                  const servings = Math.max(1, Number(recipeServings.replace(",", ".")) || 1);
                  return (
                    <View style={styles.recipeLiveSummaryV2}>
                      <Text style={styles.recipeLiveTitleV2}>Per porsjon</Text>
                      <View style={styles.recipeLiveStatsV2}>
                        <View><Text style={styles.recipeLiveValueV2}>{Math.round(totals.calories / servings)}</Text><Text style={styles.recipeLiveLabelV2}>kcal</Text></View>
                        <View><Text style={styles.recipeLiveValueV2}>{Math.round((totals.protein / servings) * 10) / 10} g</Text><Text style={styles.recipeLiveLabelV2}>protein</Text></View>
                        <View><Text style={styles.recipeLiveValueV2}>{Math.round((totals.carbs / servings) * 10) / 10} g</Text><Text style={styles.recipeLiveLabelV2}>karbo</Text></View>
                        <View><Text style={styles.recipeLiveValueV2}>{Math.round((totals.fat / servings) * 10) / 10} g</Text><Text style={styles.recipeLiveLabelV2}>fett</Text></View>
                      </View>
                    </View>
                  );
                })()}

                <Text style={styles.recipeSubTitle}>Ingredienser</Text>
                <Text style={styles.recipeHelperText}>
                  Trykk på en ingrediens for å fjerne den.
                </Text>

                {recipeIngredients.length === 0 ? (
                  <Text style={styles.recipeEmptyText}>
                    Ingen ingredienser lagt til.
                  </Text>
                ) : (
                  recipeIngredients.map((ingredient) => (
                    <Pressable
                      key={ingredient.id}
                      style={styles.recipeIngredientRow}
                      onPress={() =>
                        removeRecipeIngredient(ingredient.id)
                      }
                    >
                      <View style={styles.recipeMain}>
                        <Text style={styles.recipeName}>
                          {ingredient.food.name}
                        </Text>
                        <Text style={styles.recipeDetails}>
                          {ingredient.amountGrams} g
                        </Text>
                      </View>

                      <Text style={styles.recipeDeleteText}>Fjern</Text>
                    </Pressable>
                  ))
                )}

                <Text style={styles.recipeLabel}>Søk etter matvare</Text>
                <TextInput
                  value={recipeFoodSearch}
                  onChangeText={setRecipeFoodSearch}
                  style={styles.recipeInput}
                  placeholder="Søk"
                />

                {selectedRecipeFood && (
                  <View style={styles.selectedRecipeFood}>
                    <Text style={styles.recipeName}>
                      Valgt: {selectedRecipeFood.name}
                    </Text>

                    <TextInput
                      value={recipeAmount}
                      onChangeText={setRecipeAmount}
                      style={styles.recipeInput}
                      keyboardType="decimal-pad"
                      placeholder="100"
                    />

                    <Pressable
                      style={styles.numericDoneButton}
                      onPress={Keyboard.dismiss}
                    >
                      <Text style={styles.numericDoneButtonText}>
                        Bekreft
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.addIngredientButton}
                      onPress={addIngredientToRecipe}
                    >
                      <Text style={styles.addIngredientButtonText}>
                        Legg til ingrediens
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.recipeSearchRow}
                onPress={() => setSelectedRecipeFood(item)}
              >
                <Text style={styles.recipeName}>{item.name}</Text>
                <Text style={styles.recipeDetails}>
                  {item.calories} kcal per 100 g
                </Text>
              </Pressable>
            )}
            ListFooterComponent={
              <Pressable
                style={styles.saveRecipeButton}
                onPress={saveRecipe}
              >
                <Text style={styles.saveRecipeButtonText}>
                  {editingRecipeId
                    ? "Lagre endringer"
                    : "Lagre oppskrift"}
                </Text>
              </Pressable>
            }
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={copyMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCopyMenuOpen(false)}
      >
        <Pressable
          style={styles.copyMenuBackdrop}
          onPress={() => setCopyMenuOpen(false)}
        >
          <Pressable style={styles.copyMenuSheet} onPress={() => undefined}>
            <View style={styles.copyMenuHandle} />
            <Text style={styles.copyMenuEyebrow}>HURTIGHANDLINGER</Text>
            <Text style={styles.copyMenuTitle}>Kopier mat</Text>
            <Text style={styles.copyMenuSubtitle}>Velg hva du ønsker å kopiere.</Text>

            <Pressable
              style={styles.copyMenuPrimaryRow}
              onPress={() => { setCopyMenuOpen(false); copyPreviousDayToSelectedDate(); }}
            >
              <View style={styles.copyMenuIcon}><Text style={styles.copyMenuIconText}>↙</Text></View>
              <View style={styles.copyMenuTextWrap}>
                <Text style={styles.copyMenuRowTitle}>Kopier gårsdagen hit</Text>
                <Text style={styles.copyMenuRowSubtitle}>Legger gårsdagens mat til valgt dato</Text>
              </View>
              <Text style={styles.copyMenuArrow}>›</Text>
            </Pressable>

            <Pressable
              style={styles.copyMenuPrimaryRow}
              onPress={() => { setCopyMenuOpen(false); copyCurrentDayToTomorrow(); }}
            >
              <View style={styles.copyMenuIcon}><Text style={styles.copyMenuIconText}>↗</Text></View>
              <View style={styles.copyMenuTextWrap}>
                <Text style={styles.copyMenuRowTitle}>Kopier hele dagen til i morgen</Text>
                <Text style={styles.copyMenuRowSubtitle}>Kopierer alle dagens måltider</Text>
              </View>
              <Text style={styles.copyMenuArrow}>›</Text>
            </Pressable>

            <Text style={styles.copyMenuGroupTitle}>Kopier ett måltid til i morgen</Text>
            {([
              ["Frokost", "☀️"],
              ["Lunsj", "🥗"],
              ["Middag", "🍽️"],
              ["Mellommåltid", "🍎"],
            ] as [Meal, string][]).map(([meal, icon]) => (
              <Pressable
                key={meal}
                style={styles.copyMenuMealRow}
                onPress={() => { setCopyMenuOpen(false); copyMealToTomorrow(meal); }}
              >
                <Text style={styles.copyMenuMealEmoji}>{icon}</Text>
                <Text style={styles.copyMenuMealText}>{meal === "Mellommåltid" ? "Snacks" : meal}</Text>
                <Text style={styles.copyMenuArrow}>›</Text>
              </Pressable>
            ))}

            <Pressable style={styles.copyMenuCancel} onPress={() => setCopyMenuOpen(false)}>
              <Text style={styles.copyMenuCancelText}>Lukk</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <MealDetailScreen
        visible={mealDetailOpen}
        meal={mealDetailMeal}
        diary={diary}
        calorieGoal={calorieGoal}
        profile={profile}
        styles={styles}
        onClose={() => setMealDetailOpen(false)}
        onEditItem={(item) => {
          setMealDetailOpen(false);
          setEditingItem(item);
          setEditAmount(String(item.amountGrams ?? 100));
          setEditMeal(item.meal);
        }}
        onAddToMeal={(meal) => {
          setSelectedMeal(meal);
          setMealDetailOpen(false);
          setActiveTab("Legg til");
        }}
        onCopyMeal={(meal) => copyMealToTomorrow(meal)}
      />

      <Modal
        visible={macroGoalOpen}
        animationType="slide"
        onRequestClose={() => setMacroGoalOpen(false)}
      >
        <SafeAreaView style={styles.macroModalScreen}>
          <KeyboardAvoidingView
            style={styles.macroKeyboardView}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.macroModalHeader}>
              <View style={styles.macroModalHeaderText}>
                <Text style={styles.macroModalTitle}>
                  Daglige makromål
                </Text>
                <Text style={styles.macroModalSubtitle}>
                  Beregn et forslag eller skriv inn egne mål.
                </Text>
              </View>

              <Pressable
                style={styles.macroModalCloseButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setMacroGoalOpen(false);
                }}
              >
                <Text style={styles.macroModalCloseText}>Lukk</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.macroModalScroll}
              contentContainerStyle={styles.macroModalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                style={styles.autoMacroButton}
                onPress={generateAutomaticMacroGoals}
              >
                <Text style={styles.autoMacroButtonText}>
                  Beregn forslag automatisk
                </Text>
              </Pressable>

              {!!macroSuggestionText && (
                <View style={styles.macroSuggestionCard}>
                  <Text style={styles.autoMacroDescription}>
                    {macroSuggestionText}
                  </Text>
                </View>
              )}

              <View style={styles.macroInputCard}>
                <Text style={styles.weightLabel}>Protein i gram</Text>
                <TextInput
                  value={proteinGoalInput}
                  onChangeText={setProteinGoalInput}
                  style={styles.macroGoalInput}
                  keyboardType="number-pad"
                  placeholder="120"
                  returnKeyType="done"
                />

                <Text style={styles.weightLabel}>
                  Karbohydrater i gram
                </Text>
                <TextInput
                  value={carbsGoalInput}
                  onChangeText={setCarbsGoalInput}
                  style={styles.macroGoalInput}
                  keyboardType="number-pad"
                  placeholder="250"
                  returnKeyType="done"
                />

                <Text style={styles.weightLabel}>Fett i gram</Text>
                <TextInput
                  value={fatGoalInput}
                  onChangeText={setFatGoalInput}
                  style={styles.macroGoalInput}
                  keyboardType="number-pad"
                  placeholder="70"
                  returnKeyType="done"
                />
              </View>

              <Pressable
                style={styles.numericDoneButton}
                onPress={Keyboard.dismiss}
              >
                <Text style={styles.numericDoneButtonText}>
                  Skjul tastaturet
                </Text>
              </Pressable>

              <Pressable
                style={styles.weightSaveButton}
                onPress={saveMacroGoals}
              >
                <Text style={styles.weightSaveButtonText}>
                  Lagre makromål
                </Text>
              </Pressable>

              <Pressable
                style={styles.weightCancelButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setMacroGoalOpen(false);
                }}
              >
                <Text style={styles.weightCancelButtonText}>Avbryt</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={weightOpen}
        animationType="slide"
        onRequestClose={() => setWeightOpen(false)}
      >
        <SafeAreaView style={styles.weightScreen}>
          <StatusBar style={appTheme === "Light" ? "dark" : "light"} />

          <View style={styles.weightHeader}>
            <Text style={styles.weightTitle}>Registrer vekt</Text>

            <Pressable onPress={() => setWeightOpen(false)}>
              <Text style={styles.weightCloseText}>Lukk</Text>
            </Pressable>
          </View>

          <View style={styles.weightContent}>
            <View style={styles.weightDateCard}>
              <Text style={styles.weightDateLabel}>
                Registreres for
              </Text>
              <Text style={styles.weightDateValue}>
                {formatDate(selectedDate)}
              </Text>
            </View>

            <Text style={styles.weightLabel}>Vekt i kg</Text>

            <TextInput
              value={weightInput}
              onChangeText={setWeightInput}
              style={styles.weightInput}
              keyboardType="decimal-pad"
              placeholder={
                latestWeight !== null ? String(latestWeight) : "70"
              }
            />

            <Pressable
              style={styles.numericDoneButton}
              onPress={Keyboard.dismiss}
            >
              <Text style={styles.numericDoneButtonText}>
                Bekreft
              </Text>
            </Pressable>

            <Text style={styles.weightLabel}>Målvekt i kg</Text>

            <TextInput
              value={targetWeightInput}
              onChangeText={setTargetWeightInput}
              style={styles.weightInput}
              keyboardType="decimal-pad"
              placeholder={
                targetWeight > 0 ? String(targetWeight) : "65"
              }
            />

            <Pressable
              style={styles.numericDoneButton}
              onPress={Keyboard.dismiss}
            >
              <Text style={styles.numericDoneButtonText}>
                Bekreft
              </Text>
            </Pressable>

            <Pressable
              style={styles.targetSaveButton}
              onPress={saveTargetWeight}
            >
              <Text style={styles.targetSaveButtonText}>
                Lagre målvekt
              </Text>
            </Pressable>

            <Pressable
              style={styles.weightSaveButton}
              onPress={saveWeightEntry}
            >
              <Text style={styles.weightSaveButtonText}>
                Lagre vekt
              </Text>
            </Pressable>

            <Text style={styles.weightNote}>
              Én måling per dato. Registrerer du på nytt på samme dato,
              erstattes den tidligere verdien.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={quickAddFood !== null}
        animationType="slide"
        onRequestClose={() => setQuickAddFood(null)}
      >
        <SafeAreaView style={styles.quickAddScreen}>
          <StatusBar style={appTheme === "Light" ? "dark" : "light"} />

          <View style={styles.quickAddHeader}>
            <Text style={styles.quickAddTitle}>Legg til mat</Text>

            <Pressable onPress={() => setQuickAddFood(null)}>
              <Text style={styles.quickAddClose}>Lukk</Text>
            </Pressable>
          </View>

          <View style={styles.quickAddContent}>
            <Text style={styles.quickAddName}>
              {quickAddFood?.name}
            </Text>

            <Text style={styles.quickAddLabel}>
              {quickAddFood && foodUsesGrams(quickAddFood)
                ? "Mengde i gram"
                : "Antall porsjoner"}
            </Text>

            <TextInput
              value={quickAmount}
              onChangeText={setQuickAmount}
              style={styles.quickAddInput}
              keyboardType="decimal-pad"
              placeholder={
                quickAddFood && foodUsesGrams(quickAddFood)
                  ? "100"
                  : "1"
              }
            />

            <Pressable
              style={styles.numericDoneButton}
              onPress={Keyboard.dismiss}
            >
              <Text style={styles.numericDoneButtonText}>
                Bekreft
              </Text>
            </Pressable>

            {quickAddFood && foodUsesGrams(quickAddFood) && (
              <View style={styles.quickAmountRow}>
                {[50, 100, 150, 200].map((amount) => (
                  <Pressable
                    key={amount}
                    style={styles.quickAmountButton}
                    onPress={() => setQuickAmount(String(amount))}
                  >
                    <Text style={styles.quickAmountButtonText}>
                      {amount} g
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.quickAddLabel}>Måltid</Text>

            <View style={styles.optionRowWrap}>
              {(
                [
                  "Frokost",
                  "Lunsj",
                  "Middag",
                  "Mellommåltid",
                ] as Meal[]
              ).map((meal) => (
                <Pressable
                  key={meal}
                  style={[
                    styles.optionButton,
                    quickMeal === meal &&
                      styles.optionButtonSelected,
                  ]}
                  onPress={() => setQuickMeal(meal)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      quickMeal === meal &&
                        styles.optionButtonTextSelected,
                    ]}
                  >
                    {meal}
                  </Text>
                </Pressable>
              ))}
            </View>

            {quickAddFood && (
              <View style={styles.quickPreviewCard}>
                <Text style={styles.quickPreviewTitle}>
                  Beregnet
                </Text>
                <Text style={styles.quickPreviewText}>
                  {Math.round(
                    toSafeNumber(quickAddFood.calories) *
                      (foodUsesGrams(quickAddFood)
                        ? (Number(quickAmount.replace(",", ".")) || 0) /
                          100
                        : Number(quickAmount.replace(",", ".")) || 0)
                  )}{" "}
                  kcal
                </Text>
                <Text style={styles.quickPreviewText}>
                  Protein:{" "}
                  {(
                    toSafeNumber(quickAddFood.protein) *
                    (foodUsesGrams(quickAddFood)
                      ? (Number(quickAmount.replace(",", ".")) || 0) /
                        100
                      : Number(quickAmount.replace(",", ".")) || 0)
                  ).toFixed(1)}{" "}
                  g
                </Text>
              </View>
            )}

            <Pressable
              style={styles.quickAddConfirmButton}
              onPress={confirmQuickAdd}
            >
              <Text style={styles.quickAddConfirmText}>
                Legg til i dagboken
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={editingItem !== null}
        animationType="slide"
        onRequestClose={() => setEditingItem(null)}
      >
        <SafeAreaView style={styles.editScreen}>
          <StatusBar style={appTheme === "Light" ? "dark" : "light"} />

          <View style={styles.editHeader}>
            <Text style={styles.editTitle}>Rediger mat</Text>

            <Pressable onPress={() => setEditingItem(null)}>
              <Text style={styles.editCloseText}>Lukk</Text>
            </Pressable>
          </View>

          <View style={styles.editContent}>
            <Text style={styles.editFoodName}>
              {editingItem?.name}
            </Text>

            <Text style={styles.editLabel}>Mengde i gram</Text>
            <TextInput
              value={editAmount}
              onChangeText={setEditAmount}
              style={styles.editInput}
              keyboardType="decimal-pad"
              placeholder="100"
            />

            <Pressable
              style={styles.numericDoneButton}
              onPress={Keyboard.dismiss}
            >
              <Text style={styles.numericDoneButtonText}>
                Bekreft
              </Text>
            </Pressable>

            <Text style={styles.editLabel}>Måltid</Text>
            <View style={styles.optionRowWrap}>
              {(
                [
                  "Frokost",
                  "Lunsj",
                  "Middag",
                  "Mellommåltid",
                ] as Meal[]
              ).map((meal) => (
                <Pressable
                  key={meal}
                  style={[
                    styles.optionButton,
                    editMeal === meal &&
                      styles.optionButtonSelected,
                  ]}
                  onPress={() => setEditMeal(meal)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      editMeal === meal &&
                        styles.optionButtonTextSelected,
                    ]}
                  >
                    {meal}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.editSaveButton}
              onPress={saveEditedItem}
            >
              <Text style={styles.editSaveButtonText}>
                Lagre endringer
              </Text>
            </Pressable>

            <Pressable
              style={styles.editDeleteButton}
              onPress={deleteEditedItem}
            >
              <Text style={styles.editDeleteButtonText}>
                Slett registrering
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={profileOpen}
        animationType="slide"
        onRequestClose={() => setProfileOpen(false)}
      >
        <SafeAreaView style={styles.profileScreen}>
          <StatusBar style={appTheme === "Light" ? "dark" : "light"} />

          <View style={styles.profileHeader}>
            <Text style={styles.profileTitle}>Profil</Text>

            <Pressable onPress={() => setProfileOpen(false)}>
              <Text style={styles.profileCloseText}>Lukk</Text>
            </Pressable>
          </View>

          <FlatList
            data={[]}
            contentContainerStyle={styles.profileContent}
            ListHeaderComponent={
              <>
                <Text style={styles.profileLabel}>Navn</Text>
                <TextInput
                  value={profile.name}
                  onChangeText={(value) =>
                    setProfile((current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                  style={styles.profileInput}
                  placeholder="Fornavnet ditt"
                  autoCapitalize="words"
                />

                <Text style={styles.profileLabel}>Alder</Text>
                <TextInput
                  value={profile.age}
                  onChangeText={(value) =>
                    setProfile((current) => ({
                      ...current,
                      age: value,
                    }))
                  }
                  style={styles.profileInput}
                  keyboardType="number-pad"
                  placeholder="For eksempel 30"
                />

                <Text style={styles.profileLabel}>Høyde i cm</Text>
                <TextInput
                  value={profile.heightCm}
                  onChangeText={(value) =>
                    setProfile((current) => ({
                      ...current,
                      heightCm: value,
                    }))
                  }
                  style={styles.profileInput}
                  keyboardType="decimal-pad"
                  placeholder="For eksempel 176"
                />

                <Text style={styles.profileLabel}>Vekt i kg</Text>
                <TextInput
                  value={profile.weightKg}
                  onChangeText={(value) =>
                    setProfile((current) => ({
                      ...current,
                      weightKg: value,
                    }))
                  }
                  style={styles.profileInput}
                  keyboardType="decimal-pad"
                  placeholder="For eksempel 70"
                />

                <Pressable
                  style={styles.numericDoneButton}
                  onPress={Keyboard.dismiss}
                >
                  <Text style={styles.numericDoneButtonText}>
                    Bekreft
                  </Text>
                </Pressable>

                <Text style={styles.profileLabel}>Kjønn</Text>
                <View style={styles.optionRow}>
                  {(["Mann", "Kvinne"] as const).map((sex) => (
                    <Pressable
                      key={sex}
                      style={[
                        styles.optionButton,
                        profile.sex === sex &&
                          styles.optionButtonSelected,
                      ]}
                      onPress={() =>
                        setProfile((current) => ({
                          ...current,
                          sex,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          profile.sex === sex &&
                            styles.optionButtonTextSelected,
                        ]}
                      >
                        {sex}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.profileLabel}>Aktivitetsnivå</Text>
                <View style={styles.optionColumn}>
                  {(
                    [
                      "Lite aktiv",
                      "Lett aktiv",
                      "Moderat aktiv",
                      "Veldig aktiv",
                    ] as Profile["activity"][]
                  ).map((activity) => (
                    <Pressable
                      key={activity}
                      style={[
                        styles.optionButtonWide,
                        profile.activity === activity &&
                          styles.optionButtonSelected,
                      ]}
                      onPress={() =>
                        setProfile((current) => ({
                          ...current,
                          activity,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          profile.activity === activity &&
                            styles.optionButtonTextSelected,
                        ]}
                      >
                        {activity}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.profileLabel}>Mål</Text>
                <View style={styles.optionRowWrap}>
                  {(
                    ["Gå ned", "Holde vekten", "Gå opp"] as Profile["goal"][]
                  ).map((goal) => (
                    <Pressable
                      key={goal}
                      style={[
                        styles.optionButton,
                        profile.goal === goal &&
                          styles.optionButtonSelected,
                      ]}
                      onPress={() =>
                        setProfile((current) => ({
                          ...current,
                          goal,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          profile.goal === goal &&
                            styles.optionButtonTextSelected,
                        ]}
                      >
                        {goal}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  style={styles.calculateButton}
                  onPress={calculateSuggestedCalories}
                >
                  <Text style={styles.calculateButtonText}>
                    Beregn kalorimål
                  </Text>
                </Pressable>

                <Text style={styles.calculatorNote}>
                  Beregningen er et grovt estimat og ikke medisinsk rådgivning.
                </Text>

                <Pressable
                  style={styles.editSaveButton}
                  onPress={saveProfileChanges}
                >
                  <Text style={styles.editSaveButtonText}>
                    Lagre kroppsdata
                  </Text>
                </Pressable>
              </>
            }
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={manualOpen}
        animationType="slide"
        onRequestClose={closeManualEntry}
      >
        <SafeAreaView style={styles.manualContainer}>
          <StatusBar style={appTheme === "Light" ? "dark" : "light"} />

          <View style={styles.manualHeader}>
            <Text style={styles.manualTitle}>Legg inn vare</Text>

            <Pressable onPress={closeManualEntry}>
              <Text style={styles.manualCloseText}>Lukk</Text>
            </Pressable>
          </View>

          <View style={styles.manualContent}>
            <Text style={styles.manualLabel}>Varenavn</Text>
            <TextInput
              value={manualName}
              onChangeText={setManualName}
              style={styles.manualInput}
              placeholder="For eksempel Grovbrød"
            />

            <Text style={styles.manualLabel}>
              Kalorier per 100 g
            </Text>
            <TextInput
              value={manualCalories}
              onChangeText={setManualCalories}
              style={styles.manualInput}
              keyboardType="decimal-pad"
              placeholder="For eksempel 240"
            />

            <Text style={styles.manualLabel}>
              Protein per 100 g
            </Text>
            <TextInput
              value={manualProtein}
              onChangeText={setManualProtein}
              style={styles.manualInput}
              keyboardType="decimal-pad"
              placeholder="For eksempel 9,5"
            />

            <Text style={styles.manualLabel}>
              Karbohydrater per 100 g
            </Text>
            <TextInput
              value={manualCarbs}
              onChangeText={setManualCarbs}
              style={styles.manualInput}
              keyboardType="decimal-pad"
              placeholder="For eksempel 42"
            />

            <Text style={styles.manualLabel}>
              Fett per 100 g
            </Text>
            <TextInput
              value={manualFat}
              onChangeText={setManualFat}
              style={styles.manualInput}
              keyboardType="decimal-pad"
              placeholder="For eksempel 6,5"
            />

            <Text style={styles.manualLabel}>
              Mengde du spiste i gram
            </Text>
            <TextInput
              value={manualAmount}
              onChangeText={setManualAmount}
              style={styles.manualInput}
              keyboardType="decimal-pad"
              placeholder="100"
            />

            <Pressable
              style={styles.numericDoneButton}
              onPress={Keyboard.dismiss}
            >
              <Text style={styles.numericDoneButtonText}>
                Bekreft
              </Text>
            </Pressable>

            <Text style={styles.manualMealText}>
              Måltid: {selectedMeal}
            </Text>

            <Pressable
              style={styles.manualSaveButton}
              onPress={addManualFood}
            >
              <Text style={styles.manualSaveButtonText}>
                Lagre og legg til
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={closeScanner}
      >
        <SafeAreaView style={styles.scannerContainer}>
          <StatusBar style="light" />

          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Skann strekkode</Text>

            <Pressable
              style={styles.closeButton}
              onPress={closeScanner}
            >
              <Text style={styles.closeButtonText}>Lukk</Text>
            </Pressable>
          </View>

          {!scannedFood ? (
            <>
              <View style={styles.scannerCameraArea}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  autofocus="on"
                  enableTorch={scannerTorch}
                  onBarcodeScanned={
                    hasScanned ? undefined : handleBarcodeScanned
                  }
                  barcodeScannerSettings={{
                    barcodeTypes: [
                      "ean13",
                      "ean8",
                      "upc_a",
                      "upc_e",
                      "code128",
                    ],
                  }}
                />

                <View
                  pointerEvents="none"
                  style={styles.scannerDarkOverlay}
                />

                <View
                  pointerEvents="none"
                  style={styles.scannerFocusFrame}
                >
                  <View
                    style={[
                      styles.scannerCorner,
                      styles.scannerCornerTopLeft,
                    ]}
                  />
                  <View
                    style={[
                      styles.scannerCorner,
                      styles.scannerCornerTopRight,
                    ]}
                  />
                  <View
                    style={[
                      styles.scannerCorner,
                      styles.scannerCornerBottomLeft,
                    ]}
                  />
                  <View
                    style={[
                      styles.scannerCorner,
                      styles.scannerCornerBottomRight,
                    ]}
                  />

                  {!isLookingUpProduct && (
                    <Animated.View
                      style={[
                        styles.scannerMovingLine,
                        {
                          transform: [
                            {
                              translateY:
                                scannerLinePosition.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [8, 152],
                                }),
                            },
                          ],
                        },
                      ]}
                    />
                  )}
                </View>

                <View style={styles.scannerCameraControls}>
                  <Pressable
                    style={[
                      styles.scannerTorchButton,
                      scannerTorch &&
                        styles.scannerTorchButtonActive,
                    ]}
                    onPress={() =>
                      setScannerTorch((current) => !current)
                    }
                  >
                    <Text style={styles.scannerTorchButtonText}>
                      {scannerTorch ? "Slå av lys" : "Slå på lys"}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.scannerInstructions}>
                  {isLookingUpProduct ? (
                    <>
                      <ActivityIndicator size="large" color="#35E67B" />
                      <Text style={styles.instructionText}>
                        Strekkode funnet – henter produkt …
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.scannerInstructionTitle}>
                        Plasser strekkoden i rammen
                      </Text>
                      <Text style={styles.instructionText}>
                        Appen fanger den automatisk. Hold mobilen omtrent
                        10–20 cm fra pakken.
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.productResult}>
              <Text style={styles.resultLabel}>PRODUKT FUNNET</Text>
              <Text style={styles.resultName}>{scannedFood.name}</Text>

              <Text style={styles.amountLabel}>
                Måltid: {selectedMeal}
              </Text>

              <Text style={styles.amountLabel}>
                Hvor mange gram skal registreres?
              </Text>

              <TextInput
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="number-pad"
                style={styles.amountInput}
                placeholder="100"
                placeholderTextColor="#68756D"
              />

              <View style={styles.quickAmountRow}>
                {[50, 100, 200, 300].map((amount) => (
                  <Pressable
                    key={amount}
                    style={styles.quickAmountButton}
                    onPress={() => setAmountInput(String(amount))}
                  >
                    <Text style={styles.quickAmountText}>
                      {amount} g
                    </Text>
                  </Pressable>
                ))}
              </View>

            <Pressable
              style={styles.numericDoneButton}
              onPress={Keyboard.dismiss}
            >
              <Text style={styles.numericDoneButtonText}>
                Bekreft
              </Text>
            </Pressable>

              <View style={styles.resultGrid}>
                <Text style={styles.resultValue}>
                  {calculatedCalories} kcal
                </Text>
                <Text style={styles.resultValue}>
                  {calculatedProtein} g protein
                </Text>
                <Text style={styles.resultValue}>
                  {calculatedCarbs} g karbohydrater
                </Text>
                <Text style={styles.resultValue}>
                  {calculatedFat} g fett
                </Text>
              </View>

              <Text style={styles.perHundredText}>
                Per 100 g: {scannedFood.calories} kcal ·{" "}
                {scannedFood.protein} g protein ·{" "}
                {scannedFood.carbs} g karbohydrater ·{" "}
                {scannedFood.fat} g fett.
              </Text>

              <Pressable
                style={styles.addScannedButton}
                onPress={addScannedFood}
              >
                <Text style={styles.addScannedButtonText}>
                  Legg til i dagboken
                </Text>
              </Pressable>

              <Pressable
                style={styles.scanAgainButton}
                onPress={() => {
                  setScannedFood(null);
                  setHasScanned(false);
                  setAmountInput("100");
                }}
              >
                <Text style={styles.scanAgainText}>
                  Skann en annen vare
                </Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
