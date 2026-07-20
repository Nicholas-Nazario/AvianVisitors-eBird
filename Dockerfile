FROM php:8.3-apache

# The frontend is static and the API is PHP. Apache's PHP module lets both
# live behind one small Fly service while GitHub Pages can still host the
# frontend independently.
RUN a2enmod headers rewrite \
    && printf '%s\n' \
       '<Directory /var/www/html>' \
       '    AllowOverride None' \
       '    Require all granted' \
       '</Directory>' \
       'DirectoryIndex index.html' \
       > /etc/apache2/conf-available/avianvisitors.conf \
    && a2enconf avianvisitors

WORKDIR /var/www/html

COPY avian/frontend/ ./
COPY avian/ ./avian/

# eBird responses and dynamically generated cutouts are cached on disk.
RUN mkdir -p /var/www/html/avian/data \
    && chown -R www-data:www-data /var/www/html/avian/data

ENV APACHE_DOCUMENT_ROOT=/var/www/html

EXPOSE 80

CMD ["apache2-foreground"]
