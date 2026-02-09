/**
 * HoldPoint — Built-in Routines Data
 * Contains all 6 default routines (4 yoga, 2 hangboard)
 *
 * Yoga pose durations are in MINUTES.
 * Poses marked isCore:true scale with the core pose time setting.
 * Poses marked isTransition:true stay fixed regardless of core time.
 * Savasana uses isSavasana:true and runs at half core time.
 */

const HP_DATA = (() => {
  'use strict';

  const yogaRoutines = {
    'Yin Yoga': {
      type: 'yoga',
      focus: 'Full body flow with straddles, backbends, dragons, twists',
      poses: [
        { name: 'On Knees Toes Tucked', duration: 0.5, description: 'Kneel with toes tucked under, sit back on heels', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 0.5, description: 'Kneel with feet flat, sit back on heels', isTransition: true },
        { name: 'On Knees Toes Tucked', duration: 0.5, description: 'Toes tucked, deeper stretch', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 0.5, description: 'Feet flat, gentle stretch', isTransition: true },
        { name: 'On Knees Toes Tucked', duration: 1.5, description: 'Toes tucked, hold longer', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 1.5, description: 'Feet flat, hold longer', isTransition: true },
        { name: 'Long Legged Butterfly', duration: 5, description: 'Legs extended wide, fold forward', isCore: true },
        { name: 'Straddle Fold Left', duration: 5, description: 'Wide legs, fold toward left foot', isCore: true },
        { name: 'Straddle Fold Right', duration: 5, description: 'Wide legs, fold toward right foot', isCore: true },
        { name: 'Straddle Fold Middle', duration: 5, description: 'Wide legs, fold straight forward', isCore: true },
        { name: 'Sphinx', duration: 5, description: 'Lie on belly, prop up on forearms, gentle backbend', isCore: true },
        { name: 'Seal', duration: 5, description: 'Like sphinx but arms straight, deeper backbend', isCore: true },
        { name: 'Child\'s Pose', duration: 2, description: 'Knees wide, fold forward, arms extended', isTransition: true },
        { name: 'Low Dragon Left', duration: 2.5, description: 'Deep lunge, left foot forward, hands on floor', isCore: true },
        { name: 'Dragon Hands on Knee Left', duration: 2.5, description: 'Left foot forward, hands on front knee, upright', isCore: true },
        { name: 'Wide Dragon Left', duration: 2.5, description: 'Left foot forward, foot steps wide, sink hips', isCore: true },
        { name: 'Dragon Knee Down Left', duration: 2.5, description: 'Left foot forward, back knee down, hands on floor', isCore: true },
        { name: 'Downward Dog', duration: 1, description: 'Inverted V, press hips up and back', isTransition: true },
        { name: 'Low Dragon Right', duration: 2.5, description: 'Deep lunge, right foot forward, hands on floor', isCore: true },
        { name: 'Dragon Hands on Knee Right', duration: 2.5, description: 'Right foot forward, hands on front knee, upright', isCore: true },
        { name: 'Wide Dragon Right', duration: 2.5, description: 'Right foot forward, foot steps wide, sink hips', isCore: true },
        { name: 'Dragon Knee Down Right', duration: 2.5, description: 'Right foot forward, back knee down, hands on floor', isCore: true },
        { name: 'Downward Dog', duration: 1, description: 'Inverted V, press hips up and back', isTransition: true },
        { name: 'Twist Right', duration: 3, description: 'Lying twist, knees fall to right', isCore: true },
        { name: 'Twist Left', duration: 3, description: 'Lying twist, knees fall to left', isCore: true },
        { name: 'Savasana', duration: 3, description: 'Final rest, lie flat on back, relax completely', isSavasana: true }
      ]
    },

    'Happy Yin Happy Hips': {
      type: 'yoga',
      focus: 'Hip openers with shoelace, pigeon, hurdlers, twists',
      poses: [
        { name: 'On Knees Toes Tucked', duration: 0.75, description: 'Kneel with toes tucked under', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 0.75, description: 'Kneel with feet flat', isTransition: true },
        { name: 'On Knees Toes Tucked', duration: 0.75, description: 'Toes tucked, deeper', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 0.75, description: 'Feet flat, gentle', isTransition: true },
        { name: 'On Knees Toes Tucked', duration: 1.5, description: 'Toes tucked, long hold', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 1.5, description: 'Feet flat, long hold', isTransition: true },
        { name: 'Long Legged Butterfly', duration: 5, description: 'Legs extended wide, fold forward', isCore: true },
        { name: 'Right Shoelace Twist', duration: 1, description: 'Legs crossed right over left, gentle twist', isTransition: true },
        { name: 'Right Shoelace Fold', duration: 5, description: 'Legs crossed right over left, fold forward', isCore: true },
        { name: 'Right Half Pigeon Chest Up', duration: 1, description: 'Right shin forward, chest lifted', isTransition: true },
        { name: 'Right Half Pigeon Fold', duration: 5, description: 'Right shin forward, fold over front leg', isCore: true },
        { name: 'Left Shoelace Twist', duration: 1, description: 'Legs crossed left over right, gentle twist', isTransition: true },
        { name: 'Left Shoelace Fold', duration: 5, description: 'Legs crossed left over right, fold forward', isCore: true },
        { name: 'Left Half Pigeon Chest Up', duration: 1, description: 'Left shin forward, chest lifted', isTransition: true },
        { name: 'Left Half Pigeon Fold', duration: 5, description: 'Left shin forward, fold over front leg', isCore: true },
        { name: 'Downward Dog', duration: 1, description: 'Inverted V, shake it out', isTransition: true },
        { name: 'On Knees Full Layback', duration: 5, description: 'Kneel and lean all the way back', isCore: true },
        { name: 'Downward Dog', duration: 1, description: 'Inverted V, shake it out', isTransition: true },
        { name: 'Hurdler Right', duration: 5, description: 'Right leg extended, left foot to inner thigh, fold forward', isCore: true },
        { name: 'Hurdler Left', duration: 5, description: 'Left leg extended, right foot to inner thigh, fold forward', isCore: true },
        { name: 'Straddle Fold', duration: 5, description: 'Wide legs, fold straight forward', isCore: true },
        { name: 'Twist Right', duration: 5, description: 'Lying twist, knees fall to right', isCore: true },
        { name: 'Twist Left', duration: 5, description: 'Lying twist, knees fall to left', isCore: true },
        { name: 'Savasana', duration: 3, description: 'Final rest, lie flat, relax', isSavasana: true }
      ]
    },

    'The Yin Side of Letting Go': {
      type: 'yoga',
      focus: 'Spine work, shoelace, pigeon, and deep twists',
      poses: [
        { name: 'On Knees Toes Tucked', duration: 0.5, description: 'Kneel with toes tucked under', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 0.5, description: 'Kneel with feet flat', isTransition: true },
        { name: 'On Knees Toes Tucked', duration: 0.5, description: 'Toes tucked, deeper', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 0.5, description: 'Feet flat, gentle', isTransition: true },
        { name: 'On Knees Toes Tucked', duration: 1.5, description: 'Toes tucked, long hold', isTransition: true },
        { name: 'On Knees Feet Flat', duration: 1.5, description: 'Feet flat, long hold', isTransition: true },
        { name: 'Long Legged Butterfly', duration: 5, description: 'Legs extended wide, fold forward', isCore: true },
        { name: 'Sphinx', duration: 5, description: 'Lie on belly, prop up on forearms', isCore: true },
        { name: 'Sphinx + Seal', duration: 5, description: 'Transition from sphinx to seal, deeper backbend', isCore: true },
        { name: 'Child\'s Pose', duration: 1, description: 'Counterpose, knees wide, fold forward', isTransition: true },
        { name: 'Cat Cow', duration: 1, description: 'Hands and knees, alternate arch and round spine', isTransition: true },
        { name: 'Right Shoelace Twist', duration: 1, description: 'Legs crossed right over left, gentle twist', isTransition: true },
        { name: 'Right Shoelace Side Stretch', duration: 4, description: 'Legs crossed right over left, side stretch', isCore: true },
        { name: 'Shake Out Right', duration: 0.5, description: 'Release and shake out right side', isTransition: true },
        { name: 'Left Shoelace Twist', duration: 1, description: 'Legs crossed left over right, gentle twist', isTransition: true },
        { name: 'Left Shoelace Side Stretch', duration: 4, description: 'Legs crossed left over right, side stretch', isCore: true },
        { name: 'Shake Out Left', duration: 0.5, description: 'Release and shake out left side', isTransition: true },
        { name: 'Right Pigeon Chest Up', duration: 2, description: 'Right shin forward, chest lifted', isTransition: true },
        { name: 'Right Pigeon Fold', duration: 4, description: 'Right shin forward, fold forward', isCore: true },
        { name: 'Left Pigeon Chest Up', duration: 2, description: 'Left shin forward, chest lifted', isTransition: true },
        { name: 'Left Pigeon Fold', duration: 4, description: 'Left shin forward, fold forward', isCore: true },
        { name: 'Downward Dog', duration: 2, description: 'Inverted V, shake it out', isTransition: true },
        { name: 'Twist Right', duration: 5, description: 'Lying twist, knees fall to right', isCore: true },
        { name: 'Twist Left', duration: 5, description: 'Lying twist, knees fall to left', isCore: true },
        { name: 'Savasana', duration: 3, description: 'Final rest, lie flat, relax', isSavasana: true }
      ]
    },

    'Upper Body': {
      type: 'yoga',
      focus: 'Shoulders, chest, upper back release',
      poses: [
        { name: 'Melting Heart', duration: 5, description: 'Knees on floor, chest melts toward ground, arms extended', isCore: true },
        { name: 'Thread the Needle Right', duration: 5, description: 'Right arm threads under left, shoulder to floor', isCore: true },
        { name: 'Thread the Needle Left', duration: 5, description: 'Left arm threads under right, shoulder to floor', isCore: true },
        { name: 'Broken Wing Right', duration: 5, description: 'Lie on right side, right arm extended behind', isCore: true },
        { name: 'Broken Wing Left', duration: 5, description: 'Lie on left side, left arm extended behind', isCore: true },
        { name: 'Eagle Arms Right', duration: 5, description: 'Right arm under left, wrap forearms, lift elbows', isCore: true },
        { name: 'Eagle Arms Left', duration: 5, description: 'Left arm under right, wrap forearms, lift elbows', isCore: true },
        { name: 'Sphinx', duration: 5, description: 'Lie on belly, prop up on forearms, gentle backbend', isCore: true },
        { name: 'Seal', duration: 5, description: 'Like sphinx but arms straight, deeper backbend', isCore: true },
        { name: 'Twisted Dragon Right', duration: 5, description: 'Low lunge right foot forward, twist and reach', isCore: true },
        { name: 'Twisted Dragon Left', duration: 5, description: 'Low lunge left foot forward, twist and reach', isCore: true },
        { name: 'Savasana', duration: 5, description: 'Final rest, lie flat on back, relax completely', isSavasana: true }
      ]
    }
  };

  const hangboardRoutines = {
    '20mm + Slopers': {
      type: 'hangboard',
      description: '3 sets each grip, 7s hang / 3s rest, 6 reps per set',
      grips: ['20mm Edge', 'Slopers'],
      singleArmGrips: ['Slopers'],
      switchSeconds: 5,
      warmupSeconds: 300,
      getReadySeconds: 5,
      hangSeconds: 7,
      repRestSeconds: 3,
      setRestSeconds: 180,
      repsPerSet: 6,
      setsPerGrip: 3
    },
    '20mm + 2-Finger Pockets': {
      type: 'hangboard',
      description: '3 sets each grip, 7s hang / 3s rest, 6 reps per set',
      grips: ['20mm Edge', '2-Finger Pockets'],
      warmupSeconds: 300,
      getReadySeconds: 5,
      hangSeconds: 7,
      repRestSeconds: 3,
      setRestSeconds: 180,
      repsPerSet: 6,
      setsPerGrip: 3
    }
  };

  /**
   * Calculate total session duration for a yoga routine given core time in minutes
   */
  function calcYogaDuration(routine, coreMinutes) {
    let total = 0;
    for (const pose of routine.poses) {
      if (pose.isCore) {
        // Scale proportionally: if default core is 5min and pose is 2.5min,
        // at 4min core the pose becomes 2min (ratio preserved)
        total += (pose.duration / 5) * coreMinutes;
      } else if (pose.isSavasana) {
        total += coreMinutes / 2;
      } else {
        total += pose.duration;
      }
    }
    return Math.round(total);
  }

  /**
   * Calculate total duration for a hangboard routine in minutes
   */
  function calcHangboardDuration(routine) {
    const gripCount = routine.grips.length;
    const setsTotal = gripCount * routine.setsPerGrip;
    const repsTotal = setsTotal * routine.repsPerSet;
    const hangTime = repsTotal * routine.hangSeconds;
    const repRests = repsTotal * routine.repRestSeconds;
    const setRests = (setsTotal - 1) * routine.setRestSeconds;
    const totalSeconds = routine.warmupSeconds + hangTime + repRests + setRests + (setsTotal * routine.getReadySeconds);
    return Math.round(totalSeconds / 60);
  }

  /**
   * Get the actual duration for a yoga pose given core time
   */
  function getPoseDuration(pose, coreMinutes) {
    if (pose.isCore) {
      return (pose.duration / 5) * coreMinutes;
    } else if (pose.isSavasana) {
      return coreMinutes / 2;
    }
    return pose.duration;
  }

  return {
    yogaRoutines,
    hangboardRoutines,
    calcYogaDuration,
    calcHangboardDuration,
    getPoseDuration
  };
})();
