import { describe, expect, it } from "vitest";
import {
  computeClassBalance,
  findCrossSplitLeaks,
  findInvalidLabels,
  findOrgConcentration,
  parseManifestCsv,
} from "@/lib/modelLab/manifest";

const HEADER = "image_path,event_id,series_id,org_name,source_url,collected_at,label,secondary_labels,split,note";

describe("parseManifestCsv (가이드 6.2)", () => {
  it("정상적인 행을 파싱한다", () => {
    const csv = [
      HEADER,
      "posters/IT_DATA/e001_a.png,e001,s-hackathon-x,OO재단,https://example.com,2026-10-20,IT_DATA,,train,",
    ].join("\n");
    const { rows, errors } = parseManifestCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        imagePath: "posters/IT_DATA/e001_a.png",
        eventId: "e001",
        seriesId: "s-hackathon-x",
        orgName: "OO재단",
        sourceUrl: "https://example.com",
        collectedAt: "2026-10-20",
        label: "IT_DATA",
        secondaryLabels: [],
        split: "train",
        note: null,
      },
    ]);
  });

  it("쌍따옴표로 감싼 필드 안의 쉼표를 보존한다", () => {
    const csv = [HEADER, `posters/a.png,e001,,"OO재단, 서울",,,"IT_DATA",,train,`].join("\n");
    const { rows, errors } = parseManifestCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0].orgName).toBe("OO재단, 서울");
  });

  it("필수 컬럼이 없으면 전체를 거부한다", () => {
    const { rows, errors } = parseManifestCsv("image_path,event_id\nposters/a.png,e001");
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain("필수 컬럼");
  });

  it("split 값이 train/dev/test/ood가 아니면 그 행을 거부한다", () => {
    const csv = [HEADER, "posters/a.png,e001,,,,,IT_DATA,,unknown,"].join("\n");
    const { rows, errors } = parseManifestCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("split");
  });

  it("secondary_labels는 세미콜론이나 쉼표로 나눠 배열로 만든다", () => {
    const csv = [HEADER, `posters/a.png,e001,,,,,SOCIAL_ENVIRONMENT,"SOCIAL_WELFARE;ENERGY_ENVIRONMENT",train,`].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(rows[0].secondaryLabels).toEqual(["SOCIAL_WELFARE", "ENERGY_ENVIRONMENT"]);
  });
});

describe("findCrossSplitLeaks (가이드 6.2)", () => {
  it("같은 event_id가 여러 split에 섞이면 보고한다", () => {
    const csv = [HEADER, "posters/a.png,e001,,,,,IT_DATA,,train,", "posters/b.png,e001,,,,,IT_DATA,,test,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    const leaks = findCrossSplitLeaks(rows);
    expect(leaks).toContainEqual({ key: "e001", kind: "event_id", splits: ["test", "train"] });
  });

  it("같은 split에만 있으면 보고하지 않는다", () => {
    const csv = [HEADER, "posters/a.png,e001,,,,,IT_DATA,,train,", "posters/b.png,e001,,,,,IT_DATA,,train,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(findCrossSplitLeaks(rows)).toEqual([]);
  });
});

describe("computeClassBalance", () => {
  it("분야별 개수를 많은 순으로 센다(ood는 제외)", () => {
    const csv = [
      HEADER,
      "a.png,e1,,,,,IT_DATA,,train,",
      "b.png,e2,,,,,IT_DATA,,train,",
      "c.png,e3,,,,,DESIGN_MEDIA,,train,",
      "d.png,e4,,,,,IT_DATA,,ood,",
    ].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(computeClassBalance(rows)).toEqual([
      { label: "IT_DATA", count: 2 },
      { label: "DESIGN_MEDIA", count: 1 },
    ]);
  });
});

describe("findOrgConcentration (가이드 6.2, 기본 70%)", () => {
  it("한 분야가 특정 기관에 70% 이상 몰리면 보고한다", () => {
    const csv = [
      HEADER,
      "a.png,e1,,재단A,,,IT_DATA,,train,",
      "b.png,e2,,재단A,,,IT_DATA,,train,",
      "c.png,e3,,재단A,,,IT_DATA,,train,",
      "d.png,e4,,재단B,,,IT_DATA,,train,",
    ].join("\n");
    const { rows } = parseManifestCsv(csv);
    const result = findOrgConcentration(rows);
    expect(result).toEqual([{ label: "IT_DATA", dominantOrg: "재단A", share: 0.75 }]);
  });

  it("고르게 분산되어 있으면 보고하지 않는다", () => {
    const csv = [HEADER, "a.png,e1,,재단A,,,IT_DATA,,train,", "b.png,e2,,재단B,,,IT_DATA,,train,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(findOrgConcentration(rows)).toEqual([]);
  });
});

describe("findInvalidLabels", () => {
  it("모델 클래스 ID 목록에 없는 라벨을 찾는다", () => {
    const csv = [HEADER, "a.png,e1,,,,,NOT_A_CLASS,,train,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    const invalid = findInvalidLabels(rows, ["IT_DATA", "DESIGN_MEDIA"]);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].label).toBe("NOT_A_CLASS");
  });

  it("전부 유효하면 빈 배열이다", () => {
    const csv = [HEADER, "a.png,e1,,,,,IT_DATA,,train,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(findInvalidLabels(rows, ["IT_DATA"])).toEqual([]);
  });

  it("ood split에서 label=OOD는 유효하다(OOD가 validClassIds에 없어도)", () => {
    const csv = [HEADER, "a.png,e1,,,,,OOD,,ood,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(findInvalidLabels(rows, ["IT_DATA", "DESIGN_MEDIA"])).toEqual([]);
  });

  it("ood split인데 라벨이 OOD가 아니면 그 라벨이 validClassIds에 있어도 오류로 잡는다", () => {
    const csv = [HEADER, "a.png,e1,,,,,IT_DATA,,ood,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    const invalid = findInvalidLabels(rows, ["IT_DATA", "DESIGN_MEDIA"]);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].label).toBe("IT_DATA");
  });

  it("ood가 아닌 split에서 label=OOD는 오류로 잡는다", () => {
    const csv = [HEADER, "a.png,e1,,,,,OOD,,train,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    const invalid = findInvalidLabels(rows, ["IT_DATA", "DESIGN_MEDIA"]);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].label).toBe("OOD");
  });
});
