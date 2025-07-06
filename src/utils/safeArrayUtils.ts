/**
 * Safe array utilities to prevent crashes when API responses are not arrays
 */

/**
 * Safely filters an array, returning empty array if input is not an array
 * @param data - The data to filter (could be any type)
 * @param filterFn - The filter function to apply
 * @returns Filtered array or empty array if input is not an array
 */
export function safeFilter<T>(data: any, filterFn: (item: T, index: number, array: T[]) => boolean): T[] {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return [];
  }
  return data.filter(filterFn);
}

/**
 * Safely maps an array, returning empty array if input is not an array
 * @param data - The data to map (could be any type)
 * @param mapFn - The map function to apply
 * @returns Mapped array or empty array if input is not an array
 */
export function safeMap<T, U>(data: any, mapFn: (item: T, index: number, array: T[]) => U): U[] {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return [];
  }
  return data.map(mapFn);
}

/**
 * Safely gets the length of an array, returning 0 if input is not an array
 * @param data - The data to get length of (could be any type)
 * @returns Length of array or 0 if input is not an array
 */
export function safeLength(data: any): number {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return 0;
  }
  return data.length;
}

/**
 * Safely checks if an array includes an item, returning false if input is not an array
 * @param data - The data to check (could be any type)
 * @param item - The item to check for
 * @returns True if array includes item, false if input is not an array
 */
export function safeIncludes<T>(data: any, item: T): boolean {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return false;
  }
  return data.includes(item);
}

/**
 * Safely gets an item from an array by index, returning undefined if input is not an array
 * @param data - The data to get item from (could be any type)
 * @param index - The index to get
 * @returns Item at index or undefined if input is not an array
 */
export function safeGet<T>(data: any, index: number): T | undefined {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return undefined;
  }
  return data[index];
}

/**
 * Safely flattens an array of arrays, returning empty array if input is not an array
 * @param data - The data to flatten (could be any type)
 * @returns Flattened array or empty array if input is not an array
 */
export function safeFlatMap<T, U>(data: any, mapFn: (item: T, index: number, array: T[]) => U[]): U[] {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return [];
  }
  return data.flatMap(mapFn);
}

/**
 * Safely sorts an array, returning empty array if input is not an array
 * @param data - The data to sort (could be any type)
 * @param compareFn - The compare function to apply
 * @returns Sorted array or empty array if input is not an array
 */
export function safeSort<T>(data: any, compareFn?: (a: T, b: T) => number): T[] {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return [];
  }
  return data.sort(compareFn);
}

/**
 * Safely finds an item in an array, returning undefined if input is not an array
 * @param data - The data to search (could be any type)
 * @param predicate - The predicate function to apply
 * @returns Found item or undefined if input is not an array
 */
export function safeFind<T>(data: any, predicate: (item: T, index: number, array: T[]) => boolean): T | undefined {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return undefined;
  }
  return data.find(predicate);
}

/**
 * Safely checks if some items in an array match a predicate, returning false if input is not an array
 * @param data - The data to check (could be any type)
 * @param predicate - The predicate function to apply
 * @returns True if some items match, false if input is not an array
 */
export function safeSome<T>(data: any, predicate: (item: T, index: number, array: T[]) => boolean): boolean {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return false;
  }
  return data.some(predicate);
}

/**
 * Safely checks if all items in an array match a predicate, returning false if input is not an array
 * @param data - The data to check (could be any type)
 * @param predicate - The predicate function to apply
 * @returns True if all items match, false if input is not an array
 */
export function safeEvery<T>(data: any, predicate: (item: T, index: number, array: T[]) => boolean): boolean {
  if (!Array.isArray(data)) {
    console.warn('API response is not an array:', data);
    return false;
  }
  return data.every(predicate);
} 