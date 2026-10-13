import { test, expect, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchLatestMagicLink } from "./mailpit";
import { createAdminClient, TEST_USERS } from "../rls/helpers";

// 티처블 머신 연동 보완: 클래스 구성(classifier_class_sets)과 모델 등록(register_classifier_model)
// 화면 흐름. docs/teachable-machine-integration.md 3.6 보완, 마이그레이션 20261013060000.
// 이 저장소에는 아직 실제 모델(model.json/weights.bin)이 없으므로(가이드 9장 G3/G4), 등록 화면이
// 읽는 metadata.json만 테스트 동안 임시로 놓아 둔다 — 예측 자체는 돌리지 않는다(가짜 예측값 없음).
// 한 테스트 안에서 로그인을 한 번만 해(로그인/OTP 빈도 제한, docs/operations.md 7절) "모델 미설치"
// 상태 → metadata.json 배치 → 등록 → 평가 기본 모드 전환까지 순서대로 확인한다.

const MODEL_DIR = path.join(process.cwd(), "public", "models", "poster-classifier");
const METADATA_PATH = path.join(MODEL_DIR, "metadata.json");
const TEST_MODEL_VERSION = `e2e-test-${Date.now()}`;

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("학교 이메일").fill(email);
  await page.getByRole("button", { name: "매직링크 보내기" }).click();
  await expect(page.getByText(`${email}로 로그인 링크를 보냈어요.`)).toBeVisible();
  const magicLink = await fetchLatestMagicLink(email);
  await page.goto(magicLink);
}

test("모델 미설치 → metadata 배치 → 등록 → 평가 기본 모드 전환", async ({ page }) => {
  const admin = createAdminClient();

  await rm(METADATA_PATH, { force: true });
  await admin.from("classifier_model_registrations").delete().eq("model_version", TEST_MODEL_VERSION);
  await admin.from("model_class_field_map").delete().eq("model_version", TEST_MODEL_VERSION);

  try {
    await loginAs(page, TEST_USERS.admin.email);
    await page.goto("/admin/model-lab");

    // 1. 모델 파일이 없으면 "모델 등록" 섹션은 미설치 안내만 보여주고, 평가 기본 모드는 기존대로
    //    "예측 결과 CSV 업로드"다.
    await expect(page.getByRole("heading", { name: "모델 등록" })).toBeVisible();
    await expect(page.getByText("모델 미설치", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "예측 결과 CSV 업로드" })).toHaveClass(/bg-\[var\(--color-brand-600\)\]/);

    // 2. 모델 파일(metadata.json)을 배치하고 새로고침하면 버전·labels가 보이고, 아직 등록 전이라
    //    평가 기본 모드는 그대로 CSV 업로드다.
    await mkdir(MODEL_DIR, { recursive: true });
    await writeFile(
      METADATA_PATH,
      JSON.stringify({
        tfjsVersion: "e2e-fixture",
        tmVersion: "e2e-fixture",
        packageVersion: "e2e-fixture",
        timeStamp: TEST_MODEL_VERSION,
        userMetadata: {},
        modelName: "e2e-fixture",
        labels: ["IT_DATA", "BUSINESS_PLANNING", "DESIGN_MEDIA", "SOCIAL_ENVIRONMENT"],
      }),
      "utf-8"
    );
    await page.reload();

    await expect(page.getByText("모델 미설치", { exact: false })).not.toBeVisible();
    await expect(page.getByText(TEST_MODEL_VERSION)).toBeVisible();
    await expect(page.getByText("IT_DATA, BUSINESS_PLANNING, DESIGN_MEDIA, SOCIAL_ENVIRONMENT")).toBeVisible();
    await expect(page.getByRole("button", { name: "예측 결과 CSV 업로드" })).toHaveClass(/bg-\[var\(--color-brand-600\)\]/);

    // 3. labels가 pilot-4-v1과 일치하므로 등록 버튼이 활성화되고, 누르면 실제로 등록된다.
    const registerButton = page.getByRole("button", { name: "등록", exact: true });
    await expect(registerButton).toBeEnabled();
    await registerButton.click();
    await expect(page.getByText("등록되었어요.")).toBeVisible();

    const { data: registration } = await admin
      .from("classifier_model_registrations")
      .select("model_version")
      .eq("model_version", TEST_MODEL_VERSION)
      .maybeSingle();
    expect(registration?.model_version).toBe(TEST_MODEL_VERSION);

    // 4. 등록 후 새로고침하면 평가 섹션 기본 모드가 "모델 직접 실행"으로 바뀐다.
    await page.reload();
    await expect(page.getByRole("button", { name: "이미지 + manifest로 모델 실행" })).toHaveClass(
      /bg-\[var\(--color-brand-600\)\]/
    );
  } finally {
    await rm(METADATA_PATH, { force: true });
    await admin.from("classifier_model_registrations").delete().eq("model_version", TEST_MODEL_VERSION);
    await admin.from("model_class_field_map").delete().eq("model_version", TEST_MODEL_VERSION);
  }
});
