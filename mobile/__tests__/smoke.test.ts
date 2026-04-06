import { DroneCmd } from "../src/protocol/types";

describe("mobile smoke", () => {
    it("loads protocol constants", () => {
        expect(DroneCmd.ARM).toBe(0x01);
    });

    it("jest runs", () => {
        expect(true).toBe(true);
    });
});
