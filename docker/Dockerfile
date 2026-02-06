FROM postgres:16-alpine

# Install pg_stat_statements and other useful extensions
RUN apk add --no-cache postgresql16-contrib

# Copy custom configuration
COPY postgresql.conf /etc/postgresql/postgresql.conf

# Set permissions
USER postgres

# Expose PostgreSQL port
EXPOSE 5432

CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
