/**
 * QuantumAI / IATI OS — cTrader Dynamic Symbol Specification & Volume Normalization
 * Strictly adheres to official Spotware cTrader Open API protobuf definitions.
 */

export interface CTraderSymbolSpec {
  symbolId: number;
  symbolName: string;
  digits: number;
  pipPosition: number;
  minVolume: number; // Volume in cents (e.g. 100,000 = 0.01 lot for 10,000,000 lotSize)
  maxVolume: number; // Maximum volume in cents
  stepVolume: number; // Step volume in cents
  lotSize: number; // Lot size in cents (e.g. 10,000,000 for standard FX lot)
  enableShortSelling?: boolean;
  measurementUnits?: string;
}

export type NormalizationRejectionCode =
  | 'MISSING_SPEC'
  | 'MALFORMED_SPEC'
  | 'INVALID_QUANTITY'
  | 'BELOW_MIN_VOLUME'
  | 'ABOVE_MAX_VOLUME'
  | 'INVALID_STEP'
  | 'NON_INTEGER_CENTS'
  | 'UNSAFE_INTEGER';

export interface VolumeNormalizationResult {
  isValid: boolean;
  requestedQuantity: number;
  inputType: 'LOTS' | 'UNITS' | 'CENTS';
  normalizedVolumeCents?: number;
  normalizedLots?: number;
  symbolId?: number;
  symbolName?: string;
  conversionBasis: 'LOTS_BASED' | 'UNIT_BASED' | 'DIRECT_CENTS';
  spec?: {
    minVolume: number;
    maxVolume: number;
    stepVolume: number;
    lotSize: number;
    digits: number;
    pipPosition: number;
  };
  rejectionReason?: string;
  rejectionCode?: NormalizationRejectionCode;
}

export class CTraderVolumeNormalizer {
  /**
   * Validates integrity of broker symbol specification metadata.
   */
  public static validateSpec(spec: any): { isValid: boolean; error?: string } {
    if (!spec || typeof spec !== 'object') {
      return { isValid: false, error: 'SPEC_NULL_OR_UNDEFINED' };
    }
    if (!Number.isFinite(spec.symbolId) || spec.symbolId <= 0) {
      return { isValid: false, error: 'INVALID_SYMBOL_ID' };
    }
    if (!Number.isFinite(spec.minVolume) || spec.minVolume <= 0) {
      return { isValid: false, error: 'INVALID_MIN_VOLUME' };
    }
    if (!Number.isFinite(spec.maxVolume) || spec.maxVolume < spec.minVolume) {
      return { isValid: false, error: 'INVALID_MAX_VOLUME' };
    }
    if (!Number.isFinite(spec.stepVolume) || spec.stepVolume <= 0) {
      return { isValid: false, error: 'INVALID_STEP_VOLUME' };
    }
    if (!Number.isFinite(spec.lotSize) || spec.lotSize <= 0) {
      return { isValid: false, error: 'INVALID_LOT_SIZE' };
    }
    return { isValid: true };
  }

  /**
   * Deterministically converts and validates requested quantity against broker symbol specification.
   * Fail-closed: invalid values are rejected with explicit diagnostic reasons.
   */
  public static normalizeVolume(
    spec: CTraderSymbolSpec | null | undefined,
    requestedQuantity: number,
    inputType: 'LOTS' | 'UNITS' | 'CENTS' = 'LOTS'
  ): VolumeNormalizationResult {
    // 1. Validate spec presence
    if (!spec) {
      return {
        isValid: false,
        requestedQuantity,
        inputType,
        conversionBasis: inputType === 'LOTS' ? 'LOTS_BASED' : inputType === 'UNITS' ? 'UNIT_BASED' : 'DIRECT_CENTS',
        rejectionReason: 'SYMBOL_SPECIFICATION_MISSING: Cannot normalize volume without authoritative broker symbol metadata.',
        rejectionCode: 'MISSING_SPEC'
      };
    }

    // 2. Validate spec integrity
    const specValidation = this.validateSpec(spec);
    if (!specValidation.isValid) {
      return {
        isValid: false,
        requestedQuantity,
        inputType,
        symbolId: spec.symbolId,
        symbolName: spec.symbolName,
        conversionBasis: inputType === 'LOTS' ? 'LOTS_BASED' : inputType === 'UNITS' ? 'UNIT_BASED' : 'DIRECT_CENTS',
        rejectionReason: `MALFORMED_SYMBOL_SPECIFICATION: ${specValidation.error}`,
        rejectionCode: 'MALFORMED_SPEC'
      };
    }

    const specMeta = {
      minVolume: spec.minVolume,
      maxVolume: spec.maxVolume,
      stepVolume: spec.stepVolume,
      lotSize: spec.lotSize,
      digits: spec.digits,
      pipPosition: spec.pipPosition
    };

    // 3. Validate numeric quantity
    if (!Number.isFinite(requestedQuantity) || Number.isNaN(requestedQuantity) || requestedQuantity <= 0) {
      return {
        isValid: false,
        requestedQuantity,
        inputType,
        symbolId: spec.symbolId,
        symbolName: spec.symbolName,
        conversionBasis: inputType === 'LOTS' ? 'LOTS_BASED' : inputType === 'UNITS' ? 'UNIT_BASED' : 'DIRECT_CENTS',
        spec: specMeta,
        rejectionReason: `INVALID_REQUESTED_QUANTITY: Quantity must be a positive finite number (received: ${requestedQuantity}).`,
        rejectionCode: 'INVALID_QUANTITY'
      };
    }

    // 4. Calculate raw volume in cents
    let rawVolumeCents = 0;
    let conversionBasis: 'LOTS_BASED' | 'UNIT_BASED' | 'DIRECT_CENTS' = 'LOTS_BASED';

    if (inputType === 'LOTS') {
      conversionBasis = 'LOTS_BASED';
      rawVolumeCents = Math.round(requestedQuantity * spec.lotSize);
      // Verify no floating point fractional cents remainder
      const preciseCalc = requestedQuantity * spec.lotSize;
      if (Math.abs(preciseCalc - rawVolumeCents) > 1e-4) {
        return {
          isValid: false,
          requestedQuantity,
          inputType,
          symbolId: spec.symbolId,
          symbolName: spec.symbolName,
          conversionBasis,
          spec: specMeta,
          rejectionReason: `NON_INTEGER_VOLUME_CENTS: Requested lot quantity ${requestedQuantity} does not resolve to an integer cent volume for lotSize ${spec.lotSize}.`,
          rejectionCode: 'NON_INTEGER_CENTS'
        };
      }
    } else if (inputType === 'UNITS') {
      conversionBasis = 'UNIT_BASED';
      rawVolumeCents = Math.round(requestedQuantity * 100);
      const preciseCalc = requestedQuantity * 100;
      if (Math.abs(preciseCalc - rawVolumeCents) > 1e-4) {
        return {
          isValid: false,
          requestedQuantity,
          inputType,
          symbolId: spec.symbolId,
          symbolName: spec.symbolName,
          conversionBasis,
          spec: specMeta,
          rejectionReason: `NON_INTEGER_VOLUME_CENTS: Requested units ${requestedQuantity} must have at most 2 decimal places.`,
          rejectionCode: 'NON_INTEGER_CENTS'
        };
      }
    } else {
      conversionBasis = 'DIRECT_CENTS';
      if (!Number.isInteger(requestedQuantity)) {
        return {
          isValid: false,
          requestedQuantity,
          inputType,
          symbolId: spec.symbolId,
          symbolName: spec.symbolName,
          conversionBasis,
          spec: specMeta,
          rejectionReason: `NON_INTEGER_VOLUME_CENTS: cTrader raw volume must be an integer.`,
          rejectionCode: 'NON_INTEGER_CENTS'
        };
      }
      rawVolumeCents = requestedQuantity;
    }

    // 5. Check safe integer bounds
    if (rawVolumeCents > Number.MAX_SAFE_INTEGER || rawVolumeCents < 0) {
      return {
        isValid: false,
        requestedQuantity,
        inputType,
        symbolId: spec.symbolId,
        symbolName: spec.symbolName,
        conversionBasis,
        spec: specMeta,
        rejectionReason: `UNSAFE_INTEGER_VOLUME: Computed volume ${rawVolumeCents} exceeds JavaScript safe integer limits.`,
        rejectionCode: 'UNSAFE_INTEGER'
      };
    }

    // 6. Validate Minimum Volume
    if (rawVolumeCents < spec.minVolume) {
      return {
        isValid: false,
        requestedQuantity,
        inputType,
        symbolId: spec.symbolId,
        symbolName: spec.symbolName,
        conversionBasis,
        spec: specMeta,
        rejectionReason: `VOLUME_BELOW_MINIMUM: Computed volume ${rawVolumeCents} is below minimum allowed ${spec.minVolume} cents.`,
        rejectionCode: 'BELOW_MIN_VOLUME'
      };
    }

    // 7. Validate Maximum Volume
    if (rawVolumeCents > spec.maxVolume) {
      return {
        isValid: false,
        requestedQuantity,
        inputType,
        symbolId: spec.symbolId,
        symbolName: spec.symbolName,
        conversionBasis,
        spec: specMeta,
        rejectionReason: `VOLUME_ABOVE_MAXIMUM: Computed volume ${rawVolumeCents} exceeds maximum allowed ${spec.maxVolume} cents.`,
        rejectionCode: 'ABOVE_MAX_VOLUME'
      };
    }

    // 8. Validate Step Volume
    const stepDelta = rawVolumeCents - spec.minVolume;
    if (stepDelta % spec.stepVolume !== 0) {
      return {
        isValid: false,
        requestedQuantity,
        inputType,
        symbolId: spec.symbolId,
        symbolName: spec.symbolName,
        conversionBasis,
        spec: specMeta,
        rejectionReason: `INVALID_VOLUME_STEP: Volume ${rawVolumeCents} cents does not align with stepVolume ${spec.stepVolume} cents (offset from minVolume: ${stepDelta}).`,
        rejectionCode: 'INVALID_STEP'
      };
    }

    // 9. Successful normalization
    const normalizedLots = spec.lotSize > 0 ? (rawVolumeCents / spec.lotSize) : (rawVolumeCents / 10000000);

    return {
      isValid: true,
      requestedQuantity,
      inputType,
      normalizedVolumeCents: rawVolumeCents,
      normalizedLots,
      symbolId: spec.symbolId,
      symbolName: spec.symbolName,
      conversionBasis,
      spec: specMeta
    };
  }

  /**
   * Converts raw cTrader cents back to human lots.
   */
  public static centsToLots(spec: CTraderSymbolSpec, volumeCents: number): number {
    if (!spec || !spec.lotSize || spec.lotSize <= 0) {
      return volumeCents / 10000000;
    }
    return volumeCents / spec.lotSize;
  }

  /**
   * Converts raw cTrader cents to base units.
   */
  public static centsToUnits(volumeCents: number): number {
    return volumeCents / 100;
  }
}

/**
 * Dynamic in-memory registry of cTrader symbols.
 */
export class CTraderSymbolRegistry {
  private static symbolsById: Map<number, CTraderSymbolSpec> = new Map();
  private static symbolsByName: Map<string, CTraderSymbolSpec> = new Map();

  public static registerSymbol(spec: CTraderSymbolSpec): void {
    const validation = CTraderVolumeNormalizer.validateSpec(spec);
    if (!validation.isValid) {
      throw new Error(`CANNOT_REGISTER_INVALID_SYMBOL: ${validation.error}`);
    }
    this.symbolsById.set(spec.symbolId, { ...spec });
    if (spec.symbolName) {
      this.symbolsByName.set(spec.symbolName.toUpperCase().replace('/', '').replace('_', ''), { ...spec });
      this.symbolsByName.set(spec.symbolName, { ...spec });
    }
  }

  public static registerBatch(specs: CTraderSymbolSpec[]): void {
    specs.forEach((s) => this.registerSymbol(s));
  }

  public static getSymbolById(symbolId: number): CTraderSymbolSpec | undefined {
    return this.symbolsById.get(symbolId);
  }

  public static getSymbolByName(symbolName: string): CTraderSymbolSpec | undefined {
    const normalized = symbolName.toUpperCase().replace('/', '').replace('_', '');
    return this.symbolsByName.get(normalized) || this.symbolsByName.get(symbolName);
  }

  public static hasSymbol(identifier: string | number): boolean {
    if (typeof identifier === 'number') {
      return this.symbolsById.has(identifier);
    }
    const normalized = identifier.toUpperCase().replace('/', '').replace('_', '');
    return this.symbolsByName.has(normalized) || this.symbolsByName.has(identifier);
  }

  public static getAllSymbols(): CTraderSymbolSpec[] {
    return Array.from(this.symbolsById.values());
  }

  public static clear(): void {
    this.symbolsById.clear();
    this.symbolsByName.clear();
  }
}
