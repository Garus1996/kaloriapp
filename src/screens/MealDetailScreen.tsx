import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import type { DiaryItem, Meal, Profile } from "../types";
import { toSafeNumber } from "../utils/helpers";

type MealDetailScreenProps = {
  visible: boolean;
  meal: Meal;
  diary: DiaryItem[];
  calorieGoal: number;
  profile: Profile;
  styles: any;
  onClose: () => void;
  onEditItem: (item: DiaryItem) => void;
  onAddToMeal: (meal: Meal) => void;
  onCopyMeal: (meal: Meal) => void;
};

const clampPercent = (value: number, goal: number) => Math.min(100, Math.max(0, goal > 0 ? (value / goal) * 100 : 0));
const widthPercent = (value: number, goal: number) => `${clampPercent(value, goal)}%`;

const mealMeta: Record<string, { title: string; icon: string; accent: string }> = {
  Frokost: { title: "Frokost", icon: "☀", accent: "#FFB52E" },
  Lunsj: { title: "Lunsj", icon: "🥗", accent: "#42DB91" },
  Middag: { title: "Middag", icon: "🍴", accent: "#8B6CFF" },
  Mellommåltid: { title: "Snacks", icon: "●", accent: "#F05B98" },
};

export function MealDetailScreen({ visible, meal, diary, calorieGoal, profile, styles, onClose, onEditItem, onAddToMeal, onCopyMeal }: MealDetailScreenProps) {
  const items = diary.filter((item) => item.meal === meal);
  const totals = items.reduce((result, item) => ({
    calories: result.calories + toSafeNumber(item.calories),
    protein: result.protein + toSafeNumber(item.protein),
    carbs: result.carbs + toSafeNumber(item.carbs),
    fat: result.fat + toSafeNumber(item.fat),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const goalShare = meal === "Frokost" ? 0.25 : meal === "Lunsj" ? 0.3 : meal === "Middag" ? 0.35 : 0.1;
  const goals = {
    calories: Math.round(Math.max(0, toSafeNumber(calorieGoal)) * goalShare),
    protein: Math.round(Math.max(0, toSafeNumber(profile.proteinGoal || 120)) * goalShare),
    carbs: Math.round(Math.max(0, toSafeNumber(profile.carbsGoal || 250)) * goalShare),
    fat: Math.round(Math.max(0, toSafeNumber(profile.fatGoal || 70)) * goalShare),
  };

  const meta = mealMeta[meal] ?? mealMeta.Middag;
  const caloriePercent = Math.round(clampPercent(totals.calories, goals.calories));
  const rating = totals.calories === 0
    ? "Ingen mat registrert"
    : totals.calories < goals.calories * 0.7
      ? "Lett måltid"
      : totals.calories > goals.calories * 1.25
        ? "Over anbefalt mengde"
        : "God balanse";

  const rows = [
    { label: "Kalorier", value: Math.round(totals.calories), goal: goals.calories, unit: "kcal", color: "#F05B98" },
    { label: "Protein", value: Math.round(totals.protein * 10) / 10, goal: goals.protein, unit: "g", color: "#8B6CFF" },
    { label: "Karbohydrater", value: Math.round(totals.carbs * 10) / 10, goal: goals.carbs, unit: "g", color: "#FFB52E" },
    { label: "Fett", value: Math.round(totals.fat * 10) / 10, goal: goals.fat, unit: "g", color: "#F05B98" },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.mealDetailScreen}>
        <View style={styles.mealDetailHeader}>
          <Pressable style={styles.mealDetailBackButton} onPress={onClose}>
            <Text style={styles.mealDetailBackText}>‹</Text>
          </Pressable>
          <Text style={styles.mealDetailHeaderTitle}>{meta.title}</Text>
          <View style={styles.mealDetailHeaderSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.mealDetailContent} showsVerticalScrollIndicator={false}>
          <View style={styles.mealDetailSummaryCard}>
            <View style={[styles.mealDetailScoreCircle, { backgroundColor: meta.accent }]}>
              <Text style={styles.mealDetailScoreEmoji}>{meta.icon}</Text>
            </View>
            <View style={styles.mealDetailSummaryText}>
              <Text style={styles.mealDetailCalories}>{Math.round(totals.calories)} kcal</Text>
              <Text style={[styles.mealDetailRating, { color: meta.accent }]}>{rating}</Text>
            </View>
            <View style={styles.mealGoalBadge}>
              <Text style={styles.mealGoalBadgeValue}>{caloriePercent}%</Text>
              <Text style={styles.mealGoalBadgeLabel}>av målet</Text>
            </View>
          </View>

          <Text style={styles.mealDetailSectionEyebrow}>NÆRINGSINNHOLD</Text>
          <View style={styles.mealNutrientCard}>
            {rows.map((row, index) => (
              <View key={row.label} style={[styles.mealProgressBlock, index === rows.length - 1 && styles.mealProgressBlockLast]}>
                <View style={styles.mealNutrientRow}>
                  <Text style={styles.mealNutrientLabel}>{row.label}</Text>
                  <Text style={styles.mealNutrientValue}>{row.value} / {row.goal} {row.unit}</Text>
                </View>
                <View style={styles.mealProgressTrack}>
                  <View style={[styles.mealProgressFill, { width: widthPercent(row.value, row.goal), backgroundColor: row.color }]} />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.mealTipCard}>
            <View style={styles.mealTipIconCircle}><Text style={styles.mealTipIcon}>💡</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mealTipTitle}>Tips</Text>
              <Text style={styles.mealTipText}>
                {totals.calories > goals.calories
                  ? `Måltidet er ${Math.round(totals.calories - goals.calories)} kcal over det anbefalte målet.`
                  : `Du har ${Math.max(0, goals.calories - Math.round(totals.calories))} kcal igjen i dette måltidet.`}
              </Text>
            </View>
          </View>

          <View style={styles.mealSectionHeaderRow}>
            <Text style={styles.mealDetailSectionEyebrow}>MATVARER</Text>
            <Text style={styles.mealItemCount}>{items.length} {items.length === 1 ? "matvare" : "matvarer"}</Text>
          </View>

          {items.length === 0 ? (
            <View style={styles.mealDetailEmptyCard}>
              <Text style={styles.mealDetailEmptyIcon}>＋</Text>
              <Text style={styles.mealDetailEmptyTitle}>Måltidet er tomt</Text>
              <Text style={styles.mealDetailEmptyText}>Legg til en matvare for å se kalorier og næringsinnhold.</Text>
            </View>
          ) : (
            <View style={styles.mealFoodList}>
              {items.map((item, index) => (
                <Pressable
                  key={`detail-${item.diaryId}`}
                  style={[styles.mealFoodRow, index === items.length - 1 && styles.mealFoodRowLast]}
                  onPress={() => onEditItem(item)}
                >
                  <View style={[styles.mealFoodIcon, { backgroundColor: `${meta.accent}22` }]}>
                    <Text style={[styles.mealFoodIconText, { color: meta.accent }]}>●</Text>
                  </View>
                  <View style={styles.mealFoodText}>
                    <Text style={styles.mealFoodName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.mealFoodAmount}>{item.amountGrams ?? 100} g</Text>
                  </View>
                  <View style={styles.mealFoodValueColumn}>
                    <Text style={styles.mealFoodCalories}>{Math.round(item.calories)} kcal</Text>
                    <Text style={styles.mealFoodChevron}>›</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.mealDetailActionRow}>
            <Pressable style={[styles.mealAdjustButton, styles.mealDetailActionButton]} onPress={() => onAddToMeal(meal)}>
              <Text style={styles.mealAdjustButtonText}>＋ Legg til matvare</Text>
            </Pressable>
            <Pressable style={styles.mealCopyButton} onPress={() => onCopyMeal(meal)}>
              <Text style={styles.mealCopyButtonText}>Kopier til i morgen</Text>
            </Pressable>
          </View>

          <View style={styles.mealDetailFooterCard}>
            <View style={styles.mealDetailFooterCheck}><Text style={styles.mealDetailFooterCheckText}>✓</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mealDetailFooterTitle}>{meta.title} registrert</Text>
              <Text style={styles.mealDetailFooterText}>Trykk på en matvare for å redigere mengden.</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
