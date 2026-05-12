import { DroneCmd, buildCommandBytes } from "../src/protocol/types";

describe("mobile smoke", () => {
    it("loads protocol constants", () => {
        expect(DroneCmd.ARM).toBe(0x01);
    });

    it("HOVER maps to ARM on the wire (BLE hover = arm + firmware throttle ramp)", () => {
        const b = buildCommandBytes({ type: "HOVER" });
        expect(b[1]).toBe(DroneCmd.ARM);
        expect(b[2]).toBe(0);
    });

    it("jest runs", () => {
        expect(true).toBe(true);
    });
});
