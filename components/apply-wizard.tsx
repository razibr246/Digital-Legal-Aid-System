"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateBangladeshPhone } from "@/lib/phone/bangladesh-phone";
import { BD_DISTRICTS } from "@/lib/legal/districts";
import {
  OTHER_CATEGORY_ID,
  PROBLEM_CATEGORIES,
  getProblemCategory,
  isOtherSubcategory,
  listSubcategoryOptions,
} from "@/lib/legal/problem-taxonomy";
import { saveSimulatedSms } from "@/lib/sms/inbox";

export type IntakeLanguage = "bn" | "marma" | "chakma";

export interface ApplyWizardResult {
  docketId: string;
  applicationId: string;
  district: string;
  voicePin: string;
  phone: string;
  operator: string | null;
  displayName: string;
}

interface ApplyWizardProps {
  /** Portal UI language (bn/en chrome). The application is filed in Bangla. */
  isEnglish: boolean;
  onDone: (result: ApplyWizardResult) => void;
}

/**
 * The disability vocabulary is the voice intake's own list (দৃষ্টি, শ্রবণ, …), so a
 * disability recorded on the phone and one recorded here are the same value.
 */
const DISABILITY_OPTIONS = [
  { code: "visual", labelBn: "দৃষ্টি", labelEn: "Visual" },
  { code: "hearing", labelBn: "শ্রবণ", labelEn: "Hearing" },
  { code: "mobility", labelBn: "চলাফেরা", labelEn: "Mobility" },
  { code: "speech", labelBn: "বাক", labelEn: "Speech" },
  { code: "mental", labelBn: "মানসিক", labelEn: "Mental" },
  { code: "intellectual", labelBn: "বুদ্ধিমত্তা", labelEn: "Intellectual" },
  { code: "learning", labelBn: "শেখার প্রতিবন্ধকতা", labelEn: "Learning" },
  { code: "multiple", labelBn: "একাধিক ধরনের", labelEn: "Multiple" },
  { code: "other", labelBn: "অন্যান্য", labelEn: "Other" },
];

const GENDERS = [
  { value: "পুরুষ", labelBn: "পুরুষ", labelEn: "Male" },
  { value: "নারী", labelBn: "নারী", labelEn: "Female" },
  { value: "অন্যান্য", labelBn: "অন্যান্য", labelEn: "Other" },
];

/**
 * The wizard asks for the same slots, in the same order, that the 16699 voice
 * intake asks for. Anything the voice flow can infer from a dial pad or from
 * tone is dropped here: there is no caller ID to ask "is this your primary
 * number?", and a district is picked rather than detected from speech.
 */
/**
 * Name and phone lead: they are the two fields an officer must be able to reach a
 * person through, so they are captured before the applicant invests effort in the
 * rest, and both are required. The problem statement is last because it is the
 * longest step (category, then sub-category) and the one a caller is most likely
 * to abandon partway.
 */
const STEPS = [
  "name",
  "phone",
  "disability",
  "disabilityType",
  "gender",
  "address",
  "problem",
] as const;

type StepId = (typeof STEPS)[number];

interface FormState {
  categoryId: string | null;
  subcategoryId: string | null;
  customProblem: string;
  problem: string;
  hasDisability: boolean | null;
  disabilityType: string;
  gender: string;
  displayName: string;
  phone: string;
  address: string;
  district: string;
  /** Tri-state: "yes" | "no" | "" (unasked). Never coerce "" to "no". */
  employed: string;
  /** Blank means unproven, which is not the same as zero income. */
  monthlyIncome: string;
}

const INITIAL_FORM: FormState = {
  categoryId: null,
  subcategoryId: null,
  customProblem: "",
  problem: "",
  hasDisability: null,
  disabilityType: "",
  gender: "",
  displayName: "",
  phone: "",
  address: "",
  district: "",
  employed: "",
  monthlyIncome: "",
};

export function ApplyWizard({ isEnglish, onDone }: ApplyWizardProps) {
  const t = useCallback((bn: string, en: string) => (isEnglish ? en : bn), [isEnglish]);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Regenerated on mount so a reload of the modal starts a new application, while
  // a double submit within one sitting resolves to the same one on the server.
  const sessionIdRef = useRef<string>(`web-${crypto.randomUUID()}`);
  const headingRef = useRef<HTMLElement | null>(null);

  // Voice only asks for a disability type when the answer is yes, so the step is
  // skipped rather than shown empty.
  const visibleSteps = useMemo(
    () => STEPS.filter((id) => id !== "disabilityType" || form.hasDisability === true),
    [form.hasDisability],
  );
  const visibleIndex = Math.min(stepIndex, visibleSteps.length - 1);
  const visibleStep = visibleSteps[visibleIndex];
  const isLastVisible = visibleIndex === visibleSteps.length - 1;

  // Move focus to the new step's question so a screen reader announces it and a
  // keyboard user is not left behind on the previous step.
  useEffect(() => {
    headingRef.current?.focus();
  }, [visibleIndex]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  };

  function validateStep(current: StepId): string {
    switch (current) {
      case "problem": {
        const category = getProblemCategory(form.categoryId);
        if (!category) {
          return t("আপনার সমস্যার একটি বিভাগ নির্বাচন করুন।", "Please choose a category for your problem.");
        }
        if (category.id === OTHER_CATEGORY_ID) {
          if (form.customProblem.trim().length < 10) {
            return t(
              "অন্যান্য বিভাগে আপনার সমস্যা কমপক্ষে ১০ অক্ষরের বর্ণনা লিখুন।",
              "In the Other category, please describe your problem in at least 10 characters.",
            );
          }
          return "";
        }
        if (!form.subcategoryId) {
          return t("এই বিভাগের একটি সমস্যা নির্বাচন করুন।", "Please choose a problem within this category.");
        }
        if (isOtherSubcategory(form.subcategoryId) && form.customProblem.trim().length < 10) {
          return t(
            "অন্যান্য বিকল্পে আপনার সমস্যা কমপক্ষে ১০ অক্ষরের বর্ণনা লিখুন।",
            "For the Other option, please describe your problem in at least 10 characters.",
          );
        }
        return "";
      }
      case "name": {
        const name = form.displayName.trim();
        // Whitespace-only must not pass, and neither may a lone digit that happens
        // to be two characters long.
        if (name.length < 2) {
          return t("আপনার পূর্ণ নাম লিখুন।", "Please enter your full name.");
        }
        if (!/[\u0980-\u09FFA-Za-z]/.test(name)) {
          return t("নামে অন্তত একটি অক্ষর থাকতে হবে।", "The name must contain at least one letter.");
        }
        return "";
      }
      case "disabilityType":
        if (!form.disabilityType) {
          return t("প্রতিবন্ধকতার ধরন নির্বাচন করুন।", "Please choose a disability type.");
        }
        return "";
      case "gender":
        if (!form.gender) {
          return t("আপনার লিঙ্গ নির্বাচন করুন।", "Please choose your gender.");
        }
        return "";
      case "phone": {
        // Required, and validated as a real operator number: this is the only way
        // an officer can reach the applicant, so an empty or mistyped number is
        // rejected here rather than discovered later.
        if (!form.phone.trim()) {
          return t("আপনার মোবাইল নম্বর লিখুন।", "Please enter your mobile number.");
        }
        const result = validateBangladeshPhone(form.phone);
        if (!result.valid) return result.reasonBn || t("ফোন নম্বরটি সঠিক নয়।", "Invalid phone number.");
        return "";
      }
      case "address":
        if (form.address.trim().length < 4) {
          return t("আপনার ঠিকানা লিখুন।", "Please enter your address.");
        }
        return "";
      default:
        return "";
    }
  }

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/portal/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          language: "bn",
          problem: form.problem.trim(),
          categoryId: form.categoryId,
          subcategoryId: form.subcategoryId,
          customProblem: form.customProblem.trim(),
          hasDisability: form.hasDisability === true,
          disabilityType: form.hasDisability ? form.disabilityType : null,
          gender: form.gender,
          displayName: form.displayName.trim(),
          phone: form.phone,
          address: form.address.trim(),
          district: form.district,
          employed: form.employed === "" ? null : form.employed === "yes",
          monthlyIncome: form.monthlyIncome.trim() === "" ? null : Number(form.monthlyIncome),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(payload.error || t("আবেদন জমা দেওয়া যায়নি।", "The application could not be submitted."));
        return;
      }

      // Parity with the voice path, which drops the docket and PIN into the
      // simulated inbox. There is no real SMS here either way.
      if (payload.voicePin) {
        saveSimulatedSms(
          payload.phone,
          `${payload.user?.displayName || form.displayName.trim()}, আপনার ১৬৬৯৯ ভয়েস লগইন পিন: ${payload.voicePin}। ডকেট নম্বর ${payload.docketId}। এই পিনটি ৩০ দিনের জন্য ব্যবহার করতে পারবেন।`,
        );
      }

      onDone({
        docketId: payload.docketId,
        applicationId: payload.applicationId,
        district: payload.district,
        voicePin: payload.voicePin,
        phone: payload.phone,
        operator: payload.operator,
        displayName: form.displayName.trim(),
      });
    } catch {
      setError(t("আবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।", "Could not submit. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }, [form, t, onDone]);

  async function handleNext() {
    if (visibleStep === "disability" && form.hasDisability === null) {
      setError(t("হ্যাঁ অথবা না নির্বাচন করুন।", "Please choose yes or no."));
      return;
    }

    const failure = validateStep(visibleStep);
    if (failure) {
      setError(failure);
      return;
    }

    if (isLastVisible) {
      await submit();
      return;
    }
    setStepIndex((index) => index + 1);
  }

  function handleBack() {
    setError("");
    setStepIndex((index) => Math.max(0, index - 1));
  }

  const progress = Math.round(((visibleIndex + 1) / visibleSteps.length) * 100);

  return (
    <div className="ref-application-form">
      <div className="ref-application-progress">
        <div className="ref-application-progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="ref-application-progress-label">
          {t(`ধাপ ${visibleIndex + 1} / ${visibleSteps.length}`, `Step ${visibleIndex + 1} of ${visibleSteps.length}`)}
        </p>
      </div>

      {visibleStep === "problem" ? (
        <div className="ref-problem-step">
          <span ref={headingRef} tabIndex={-1} className="ref-step-question">
            {t("আপনার সমস্যার বিভাগ নির্বাচন করুন", "Choose the category of your problem")}
          </span>

          {!form.categoryId ? (
            <div className="ref-category-grid" role="radiogroup" aria-label={t("সমস্যার বিভাগ", "Problem category")}>
              {PROBLEM_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={form.categoryId === category.id}
                  className="ref-category-card"
                  onClick={() => update("categoryId", category.id)}
                >
                  <span className="ref-category-bn">{t(category.bn, category.en)}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <button
                type="button"
                className="ref-back-link"
                onClick={() => {
                  update("categoryId", null);
                  update("subcategoryId", null);
                }}
              >
                ← {t("বিভাগ পরিবর্তন করুন", "Change category")}
              </button>

              {getProblemCategory(form.categoryId)?.freeText ? (
                <label className="ref-label">
                  <span>{t("আপনার সমস্যা লিখুন", "Describe your problem")}</span>
                  <textarea
                    rows={5}
                    value={form.customProblem}
                    onChange={(event) => update("customProblem", event.target.value)}
                    placeholder={t(
                      "যা ঘটেছে এবং আপনি কী সাহায্য চান",
                      "What happened and what help you want",
                    )}
                  />
                </label>
              ) : (
                <fieldset className="ref-fieldset">
                  <legend>
                    <span ref={headingRef} tabIndex={-1}>
                      {t("এই বিভাগে আপনার সমস্যাটি কোনটি?", "Which of these best describes your problem?")}
                    </span>
                  </legend>
                  <div className="ref-choice-list">
                    {listSubcategoryOptions(form.categoryId).map((sub) => (
                      <label key={sub.id} className="ref-choice">
                        <input
                          type="radio"
                          name="problem-subcategory"
                          checked={form.subcategoryId === sub.id}
                          onChange={() => update("subcategoryId", sub.id)}
                        />
                        <span>{t(sub.bn, sub.en)}</span>
                      </label>
                    ))}
                  </div>
                  {isOtherSubcategory(form.subcategoryId) ? (
                    <label className="ref-label">
                      <span>{t("অন্যান্য বিভাগে আপনার সমস্যা লিখুন", "Describe your problem in this category")}</span>
                      <textarea
                        rows={4}
                        value={form.customProblem}
                        onChange={(event) => update("customProblem", event.target.value)}
                        placeholder={t(
                          "এই বিভাগের কোনোটি মিলছে না হলে যা ঘটেছে তা লিখুন",
                          "If none of these fit, write what happened",
                        )}
                      />
                    </label>
                  ) : null}
                </fieldset>
              )}
            </>
          )}
        </div>
      ) : null}

      {visibleStep === "disability" ? (
            <fieldset className="ref-fieldset">
              <legend>
                <span ref={headingRef} tabIndex={-1}>
                {t(
                  "আপনার কি কোনো শারীরিক বা বিশেষ প্রতিবন্ধকতা রয়েছে?",
                  "Do you have any physical or specific disability?",
                )}
              </span>
              </legend>
              <div className="ref-choice-list">
                <label className="ref-choice">
                  <input
                    type="radio"
                    name="has-disability"
                    checked={form.hasDisability === true}
                    onChange={() => update("hasDisability", true)}
                  />
                  <span>{t("হ্যাঁ", "Yes")}</span>
                </label>
                <label className="ref-choice">
                  <input
                    type="radio"
                    name="has-disability"
                    checked={form.hasDisability === false}
                    onChange={() => update("hasDisability", false)}
                  />
                  <span>{t("না", "No")}</span>
                </label>
              </div>
            </fieldset>
          ) : null}

          {visibleStep === "disabilityType" ? (
            <label className="ref-label">
              <span ref={headingRef} tabIndex={-1}>
                {t("কোন ধরনের প্রতিবন্ধকতা আছে?", "What type of disability?")}
              </span>
              <select value={form.disabilityType} onChange={(event) => update("disabilityType", event.target.value)}>
                <option value="">{t("নির্বাচন করুন", "Select one")}</option>
                {DISABILITY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.labelBn}>
                    {t(option.labelBn, option.labelEn)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {visibleStep === "gender" ? (
            <fieldset className="ref-fieldset">
              <legend>
                <span ref={headingRef} tabIndex={-1}>
                {t("আপনার লিঙ্গ কী?", "What is your gender?")}
              </span>
              </legend>
              <div className="ref-choice-list">
                {GENDERS.map((option) => (
                  <label key={option.value} className="ref-choice">
                    <input
                      type="radio"
                      name="gender"
                      checked={form.gender === option.value}
                      onChange={() => update("gender", option.value)}
                    />
                    <span>{t(option.labelBn, option.labelEn)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {visibleStep === "name" ? (
            <label className="ref-label">
              <span ref={headingRef} tabIndex={-1}>
                {t("আপনার পূর্ণ নাম", "Your full name")}
              </span>
              <input
                value={form.displayName}
                onChange={(event) => update("displayName", event.target.value)}
                placeholder={t("যেমন: রহিমা খাতুন", "e.g. Rahima Khatun")}
                autoComplete="name"
              />
            </label>
          ) : null}

          {visibleStep === "phone" ? (
            <label className="ref-label">
              <span ref={headingRef} tabIndex={-1}>
                {t("যে ফোন নম্বরে আমরা আপনাকে সহজে ফোন করতে পারি", "The number we can easily reach you on")}
              </span>
              <input
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
                placeholder="01XXXXXXXXX"
                inputMode="numeric"
                type="tel"
                autoComplete="tel"
              />
              {form.phone ? (
                <span className="ref-field-hint">
                  {validateBangladeshPhone(form.phone).valid && validateBangladeshPhone(form.phone).operator
                    ? `${t("অপারেটর", "Operator")}: ${validateBangladeshPhone(form.phone).operator}`
                    : ""}
                </span>
              ) : null}
            </label>
          ) : null}

          {visibleStep === "address" ? (
            <>
              <label className="ref-label">
                <span ref={headingRef} tabIndex={-1}>
                  {t("আপনার বর্তমান ঠিকানা", "Your current address")}
                </span>
                <textarea
                  rows={3}
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                  placeholder={t("বাড়ি, রাস্তা, থানা", "House, road, thana")}
                  autoComplete="street-address"
                />
              </label>
              <fieldset className="ref-fieldset">
                <legend>
                  <span>{t("আপনি কি কোনো কাজ করেন?", "Are you currently working?")}</span>
                </legend>
                <p className="ref-hint">
                  {t(
                    "বিনা মূল্যে আইনি সহায়তার শর্ত যাচাই করতে এই তথ্য প্রয়োজন। প্রতিবন্ধী ব্যক্তি ও নির্চিত আয়ের অধিকারী ব্যক্তির জন্য সহায়তার বিধান আলাদা।",
                    "We need this to check the free legal aid rules. The provisions for persons with disabilities and for those on a guaranteed income are different.",
                  )}
                </p>
                <div className="ref-choice-list">
                  <label className="ref-choice">
                    <input
                      type="radio"
                      name="employed"
                      checked={form.employed === "yes"}
                      onChange={() => update("employed", "yes")}
                    />
                    <span>{t("হ্যাঁ, কোনো কাজ বা আয় আছে", "Yes, I am working or have income")}</span>
                  </label>
                  <label className="ref-choice">
                    <input
                      type="radio"
                      name="employed"
                      checked={form.employed === "no"}
                      onChange={() => update("employed", "no")}
                    />
                    <span>{t("না, কোনো কাজ বা স্থায়ী আয় নেই", "No, I have no work or income")}</span>
                  </label>
                </div>
              </fieldset>
              <label className="ref-label">
                <span>{t("সংসারের মাসিক আয় (টাকা)", "Monthly household income (BDT)")}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.monthlyIncome}
                  onChange={(event) => update("monthlyIncome", event.target.value)}
                  placeholder={t("জানা না থাকলে খালি রাখুন", "Leave blank if unknown")}
                />
              </label>
              <label className="ref-label">
                <span>{t("জেলা", "District")}</span>
                <select value={form.district} onChange={(event) => update("district", event.target.value)}>
                  <option value="">{t("নির্বাচন করুন", "Select one")}</option>
                  {BD_DISTRICTS.map((district) => (
                    <option key={district.bn} value={district.bn}>
                      {t(district.bn, district.en)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {error ? (
            <p className="ref-application-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="ref-application-actions">
            {visibleIndex > 0 ? (
              <button
                type="button"
                className="ref-btn ref-btn-white"
                onClick={handleBack}
                disabled={submitting}
              >
                {t("পেছনে", "Back")}
              </button>
            ) : null}
            <button
              type="button"
              className="ref-btn ref-btn-green"
              onClick={handleNext}
              disabled={submitting}
            >
              {submitting
                ? t("পাঠানো হচ্ছে…", "Submitting…")
                : isLastVisible
                  ? t("আবেদন জমা দিন", "Submit application")
                  : t("পরবর্তী", "Next")}
            </button>
          </div>
    </div>
  );
}
