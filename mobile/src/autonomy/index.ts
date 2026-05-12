export {
  DEFAULT_FOLLOW_MOCK_CONFIG,
  evaluateFollowMock,
} from "./follow-mock";
export type {
  FollowMockConfig,
  FollowMockInputs,
  FollowMockOutput,
  FollowState,
  MotorThrottles,
} from "./follow-mock";

export { useFollowMockController } from "./use-follow-mock-controller";
export type {
  FollowMockCommsLike,
  FollowMockControllerView,
  UseFollowMockControllerOptions,
} from "./use-follow-mock-controller";
