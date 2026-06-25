import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PhysiciansScreen from './src/screens/PhysiciansScreen';
import RulesScreen from './src/screens/RulesScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import TimeOffScreen from './src/screens/TimeOffScreen';
import { StoreProvider } from './src/store/store';
import { theme } from './src/theme';

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Schedule: '🗓️',
  Physicians: '🩺',
  TimeOff: '🏖️',
  Rules: '⚙️',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>{ICONS[name]}</Text>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <StatusBar style="dark" />
          <NavigationContainer>
            <Tab.Navigator
              tabBar={(props) => (
                <View style={styles.tabBarWrap}>
                  <BottomTabBar {...props} />
                </View>
              )}
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.colors.textSubtle,
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                tabBarStyle: { borderTopColor: theme.colors.border, backgroundColor: theme.colors.card },
                tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
              })}
            >
              <Tab.Screen name="Schedule" component={ScheduleScreen} />
              <Tab.Screen name="Physicians" component={PhysiciansScreen} />
              <Tab.Screen name="TimeOff" component={TimeOffScreen} options={{ title: 'Time Off' }} />
              <Tab.Screen name="Rules" component={RulesScreen} />
            </Tab.Navigator>
          </NavigationContainer>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {},
});
