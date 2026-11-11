package com.example.workspace.directory;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * Issues short-lived tokens that act on behalf of a user when this service calls the auth service,
 * like the document service does for this one. Both share the signing secret.
 */
@Component
public class ServiceTokenIssuer {
    private static final Duration LIFETIME = Duration.ofMinutes(1);

    private final byte[] secret;

    public ServiceTokenIssuer(@Value("${JWT_SECRET_KEY}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String issueFor(String userId) {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(userId)
                .expirationTime(Date.from(Instant.now().plus(LIFETIME)))
                .build();
        try {
            SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            jwt.sign(new MACSigner(secret));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign service token", e);
        }
    }
}
