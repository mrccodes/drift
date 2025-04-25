// Helper utilities available everywhere

/* 
  * Returns a random integer between min (inclusive) and max (exclusive).
*/
export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }
  

export function gameIsLoading(isLoading) {
  if (isLoading.car || isLoading.level || isLoading.obstacles || isLoading.coins)
    return true;
  else
    return false;
}