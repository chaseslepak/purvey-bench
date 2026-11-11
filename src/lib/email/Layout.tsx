import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

/** Purvey-styled email: grey ground, cream card, Host Grotesk heading, blue button. */
export function EmailLayout({ preview, heading, paragraphs, cta, footerNote, unsubscribe }: {
  preview: string; heading: string; paragraphs: string[]; cta?: { label: string; href: string }; footerNote?: string; unsubscribe?: { href: string; label: string };
}) {
  const font = "Inter, Helvetica, Arial, sans-serif";
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#cbc9c6", margin: 0, padding: "24px 12px", fontFamily: font }}>
        <Container style={{ maxWidth: 560, backgroundColor: "#f7f5f1", borderRadius: 24, padding: 40 }}>
          <Text style={{ fontFamily: "'Host Grotesk', Helvetica, Arial, sans-serif", fontSize: 26, letterSpacing: "-0.5px", margin: 0, color: "#000" }}>purvey</Text>
          <Text style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "#535353", margin: "24px 0 8px" }}>Purvey Bench</Text>
          <Heading as="h1" style={{ fontFamily: "'Host Grotesk', Helvetica, Arial, sans-serif", fontWeight: 400, fontSize: 28, lineHeight: "34px", letterSpacing: "-0.5px", margin: "0 0 16px", color: "#000" }}>{heading}</Heading>
          {paragraphs.map((p, i) => <Text key={i} style={{ fontSize: 16, lineHeight: "24px", color: "#333", margin: "0 0 14px", whiteSpace: "pre-line" }}>{p}</Text>)}
          {cta && (
            <Section style={{ margin: "24px 0 8px" }}>
              <Button href={cta.href} style={{ backgroundColor: "#3676b1", color: "#fff", borderRadius: 8, padding: "15px 28px", fontSize: 14, fontWeight: 500, letterSpacing: "1.68px", textTransform: "uppercase", textDecoration: "none" }}>{cta.label}</Button>
            </Section>
          )}
          {footerNote && <Text style={{ fontSize: 13, lineHeight: "20px", color: "#535353", margin: "24px 0 0" }}>{footerNote}</Text>}
        </Container>
        <Container style={{ maxWidth: 560, padding: "16px 8px 0" }}>
          <Hr style={{ borderColor: "#b6b6b6", margin: "0 0 12px" }} />
          <Text style={{ fontSize: 12, color: "#535353", textAlign: "center", margin: 0 }}>
            Purvey CPG · Supporting purveyors of emerging brands.
            {unsubscribe && <> · <Link href={unsubscribe.href} style={{ color: "#535353", textDecoration: "underline" }}>{unsubscribe.label}</Link></>}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
